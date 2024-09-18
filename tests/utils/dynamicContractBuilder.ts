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
                `${diagnostic.file.fileName} (${line + 1},${
                    character + 1
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
        console.log(compiledFilePath)

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
