import * as ts from 'typescript'
import * as path from 'path'

export async function buildContract(
    dynamicFileName: string,
    dynamicCode: string
) {
    const configFile = {
        config: {
            include: [dynamicFileName],
            compilerOptions: {
                target: 'ESNext',
                lib: ['ES2020'],
                experimentalDecorators: true,
                module: 'commonjs',
                moduleResolution: 'node',
                outDir: 'dist',
                strict: false,
                skipLibCheck: true,
                sourceMap: true,
                declaration: true,
                resolveJsonModule: true,
                noEmit: false,
                esModuleInterop: true,
                plugins: [
                    {
                        transform: 'scrypt-ts-transpiler',
                        transformProgram: true,
                        outDir: 'artifacts',
                    },
                ],
            },
        },
        error: undefined,
    }
    const currentDir = process.cwd()
    const parsedCommandLine = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        currentDir
    )

    // Compiler options and file names from tsconfig.json
    const compilerOptions = parsedCommandLine.options
    const fileNames = parsedCommandLine.fileNames

    // Create a custom compiler host
    const host = ts.createCompilerHost(compilerOptions)

    // Override the readFile method to include dynamic code
    const originalReadFile = host.readFile
    host.readFile = (fileName: string) => {
        if (path.resolve(fileName) === path.resolve(dynamicFileName)) {
            return dynamicCode
        } else {
            return originalReadFile(fileName)
        }
    }

    // Override the fileExists method to recognize the dynamic file
    const originalFileExists = host.fileExists
    host.fileExists = (fileName: string) => {
        if (path.resolve(fileName) === path.resolve(dynamicFileName)) {
            return true
        } else {
            return originalFileExists(fileName)
        }
    }

    // Include the dynamic source file
    const allFileNames = fileNames.concat([dynamicFileName])

    // Create the TypeScript program
    const program = ts.createProgram(allFileNames, compilerOptions, host)

    // Emit the compiled code
    const emitResult = program.emit()

    // Handle diagnostics
    const diagnostics = ts
        .getPreEmitDiagnostics(program)
        .concat(emitResult.diagnostics)

    diagnostics.forEach((diagnostic) => {
        if (diagnostic.file) {
            const { line, character } = ts.getLineAndCharacterOfPosition(
                diagnostic.file,
                diagnostic.start!
            )
            const message = ts.flattenDiagnosticMessageText(
                diagnostic.messageText,
                '\n'
            )
            console.error(
                `${diagnostic.file.fileName} (${line + 1},${character + 1
                }): ${message}`
            )
        } else {
            console.error(
                ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
            )
        }
    })

    const exitCode = emitResult.emitSkipped ? 1 : 0
    if (exitCode === 0) {
        // Successfully compiled, now load and use the dynamic class

        // Path to the compiled JavaScript file
        const outputDir = compilerOptions.outDir || '.'
        const compiledFilePath = path.join(
            outputDir,
            dynamicFileName.replace(/\.ts$/, '.js')
        )

        // Resolve the full path to the compiled module
        const modulePath = path.resolve(compiledFilePath)

        // Clear the module from the cache to ensure fresh load
        delete require.cache[require.resolve(modulePath)]

        // Require the compiled module
        const dynamicModule = require(modulePath)

        return dynamicModule
    } else {
        throw new Error('Failed compiling dynamic contract.')
    }
}

export function mergeModulesIntoBase(
    baseFile: ts.SourceFile,
    moduleFiles: ts.SourceFile[],
    resultClassName: string
): ts.SourceFile {
    const moduleClassDeclarations: ts.ClassDeclaration[] = [];
    const moduleTypeAliasDeclarations: ts.TypeAliasDeclaration[] = [];
    const scryptTsImportsSet = new Set<string>();
    const scryptTsModuleSpecifier = 'scrypt-ts';

    // Function to collect imports from 'scrypt-ts'
    function collectScryptTsImports(node: ts.Node) {
        if (
            ts.isImportDeclaration(node) &&
            ts.isStringLiteral(node.moduleSpecifier)
        ) {
            if (node.moduleSpecifier.text === scryptTsModuleSpecifier) {
                const importClause = node.importClause;
                if (
                    importClause &&
                    importClause.namedBindings &&
                    ts.isNamedImports(importClause.namedBindings)
                ) {
                    for (const element of importClause.namedBindings.elements) {
                        scryptTsImportsSet.add(element.name.text);
                    }
                }
            }
        }
        ts.forEachChild(node, collectScryptTsImports);
    }

    // Collect imports from the base file
    collectScryptTsImports(baseFile);

    // Collect module class declarations and imports from module files
    for (const moduleFile of moduleFiles) {
        collectScryptTsImports(moduleFile);

        ts.forEachChild(moduleFile, node => {
            if (
                ts.isClassDeclaration(node) &&
                node.name &&
                ts.isIdentifier(node.name)
            ) {
                moduleClassDeclarations.push(node);
            } else if (ts.isTypeAliasDeclaration(node)) {
                moduleTypeAliasDeclarations.push(node);
            }
        });
    }

    if (moduleClassDeclarations.length === 0) {
        throw new Error('No module classes found in the module files.');
    }

    // Find the base class declaration in the base file
    let baseClassDeclaration: ts.ClassDeclaration | undefined;
    const otherBaseStatements: ts.Statement[] = [];

    ts.forEachChild(baseFile, node => {
        if (
            ts.isClassDeclaration(node) &&
            node.name
        ) {
            baseClassDeclaration = node;
        } else {
            otherBaseStatements.push(node as ts.Statement);
        }
    });

    if (!baseClassDeclaration) {
        throw new Error('Base class not found in the base file.');
    }

    // Separate class members
    const baseProperties: ts.PropertyDeclaration[] = [];
    const baseConstructor: ts.ConstructorDeclaration[] = [];
    const baseMethods: ts.MethodDeclaration[] = [];

    for (const member of baseClassDeclaration.members) {
        if (ts.isConstructorDeclaration(member)) {
            baseConstructor.push(member);
        } else if (ts.isMethodDeclaration(member)) {
            baseMethods.push(member);
        } else if (ts.isPropertyDeclaration(member)) {
            baseProperties.push(member);
        }
    }

    // Collect module class members
    const moduleProperties: ts.PropertyDeclaration[] = [];
    const moduleMethods: ts.MethodDeclaration[] = [];

    for (const moduleClass of moduleClassDeclarations) {
        for (const member of moduleClass.members) {
            if (ts.isConstructorDeclaration(member)) {
                continue; // Ignore constructors from modules
            } else if (ts.isMethodDeclaration(member)) {
                moduleMethods.push(member);
            } else if (ts.isPropertyDeclaration(member)) {
                moduleProperties.push(member);
            }
        }
    }

    // Merge properties and methods
    const mergedProperties = [...baseProperties, ...moduleProperties];
    const mergedMethods = [...baseMethods, ...moduleMethods];

    // Collect all property names and types for constructor parameters
    const propertyParameters: ts.ParameterDeclaration[] = [];
    const constructorBodyStatements: ts.Statement[] = [];

    const propertyNamesSet = new Set<string>();

    // Helper function to create a parameter and assignment for a property
    function addPropertyToConstructor(property: ts.PropertyDeclaration) {
        if (property.name && ts.isIdentifier(property.name)) {
            const propName = property.name.text;
            if (!propertyNamesSet.has(propName)) {
                propertyNamesSet.add(propName);

                // Get the type of the property
                let propType: ts.TypeNode | undefined = property.type;

                // If the property doesn't have an explicit type, default to 'any'
                if (!propType) {
                    propType = ts.factory.createKeywordTypeNode(ts.SyntaxKind.AnyKeyword);
                }

                // Create a parameter for the constructor
                const parameter = ts.factory.createParameterDeclaration(
                    undefined,
                    undefined,
                    ts.factory.createIdentifier(propName),
                    undefined,
                    propType,
                    undefined
                );
                propertyParameters.push(parameter);

                // Create an assignment statement: this.propName = propName;
                const assignment = ts.factory.createExpressionStatement(
                    ts.factory.createBinaryExpression(
                        ts.factory.createPropertyAccessExpression(
                            ts.factory.createThis(),
                            propName
                        ),
                        ts.factory.createToken(ts.SyntaxKind.EqualsToken),
                        ts.factory.createIdentifier(propName)
                    )
                );
                constructorBodyStatements.push(assignment);
            }
        }
    }

    // Add properties from base class to constructor parameters
    for (const property of baseProperties) {
        addPropertyToConstructor(property);
    }

    // Add properties from module classes to constructor parameters
    for (const property of moduleProperties) {
        addPropertyToConstructor(property);
    }

    // Handle the constructor
    let mergedConstructor: ts.ConstructorDeclaration;

    if (baseConstructor.length > 0) {
        const baseCtor = baseConstructor[0];

        // Merge parameters
        const mergedParameters = [
            ...propertyParameters
        ];

        // Merge body statements
        const mergedBodyStatements: ts.Statement[] = [];

        // Include 'super(...arguments);' if needed
        if (baseCtor.body && baseCtor.body.statements.length > 0) {
            for (const statement of baseCtor.body.statements) {
                if (
                    ts.isExpressionStatement(statement) &&
                    ts.isCallExpression(statement.expression) &&
                    statement.expression.expression.kind === ts.SyntaxKind.SuperKeyword
                ) {
                    // Keep 'super(...arguments);'
                    mergedBodyStatements.push(statement);
                }
            }
        } else {
            // If no constructor body in base class, add 'super(...arguments);'
            mergedBodyStatements.push(
                ts.factory.createExpressionStatement(
                    ts.factory.createCallExpression(
                        ts.factory.createSuper(),
                        undefined,
                        [ts.factory.createSpreadElement(ts.factory.createIdentifier('arguments'))]
                    )
                )
            );
        }

        // Add property assignments
        mergedBodyStatements.push(...constructorBodyStatements);

        mergedConstructor = ts.factory.updateConstructorDeclaration(
            baseCtor,
            baseCtor.modifiers,
            mergedParameters,
            ts.factory.createBlock(mergedBodyStatements, true)
        );
    } else {
        // If base class doesn't have a constructor, create one
        mergedConstructor = ts.factory.createConstructorDeclaration(
            undefined,
            propertyParameters,
            ts.factory.createBlock(
                [
                    // Call super(...arguments);
                    ts.factory.createExpressionStatement(
                        ts.factory.createCallExpression(
                            ts.factory.createSuper(),
                            undefined,
                            [ts.factory.createSpreadElement(ts.factory.createIdentifier('arguments'))]
                        )
                    ),
                    ...constructorBodyStatements
                ],
                true
            )
        );
    }

    // Create the merged class members in the desired order
    const mergedClassMembers = [
        ...mergedProperties,
        mergedConstructor,
        ...mergedMethods,
    ];

    // Create the merged class declaration with the new class name
    const mergedClassDeclaration = ts.factory.updateClassDeclaration(
        baseClassDeclaration,
        baseClassDeclaration.modifiers,
        ts.factory.createIdentifier(resultClassName),
        baseClassDeclaration.typeParameters,
        baseClassDeclaration.heritageClauses,
        mergedClassMembers
    );

    // Create the merged import declaration from 'scrypt-ts'
    const mergedScryptTsImport = ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(
            false,
            undefined,
            ts.factory.createNamedImports(
                Array.from(scryptTsImportsSet)
                    .sort()
                    .map(name =>
                        ts.factory.createImportSpecifier(
                            false,
                            undefined,
                            ts.factory.createIdentifier(name)
                        )
                    )
            )
        ),
        ts.factory.createStringLiteral(scryptTsModuleSpecifier)
    );

    // Prepare the updated statements for the new source file
    const newStatements: ts.Statement[] = [];

    // Add the merged import from 'scrypt-ts'
    newStatements.push(mergedScryptTsImport);

    // Add any other imports from the base file that are not 'scrypt-ts'
    for (const statement of otherBaseStatements) {
        if (
            !(
                ts.isImportDeclaration(statement) &&
                ts.isStringLiteral(statement.moduleSpecifier) &&
                statement.moduleSpecifier.text === scryptTsModuleSpecifier
            )
        ) {
            newStatements.push(statement);
        }
    }

    // Add type alias declarations from module files
    newStatements.push(...moduleTypeAliasDeclarations);

    // Add the merged class declaration
    newStatements.push(mergedClassDeclaration);

    // Create a new source file with the updated statements
    const newSourceFile = ts.factory.updateSourceFile(baseFile, newStatements);

    return newSourceFile;
}