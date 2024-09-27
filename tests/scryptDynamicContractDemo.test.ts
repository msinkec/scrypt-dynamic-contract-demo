import * as path from 'path'
import * as fs from 'fs'
import { expect, use } from 'chai'
import { findSig, MethodCallOptions, PubKey, Sha256, sha256, SmartContract, toByteString } from 'scrypt-ts'

import { getDefaultSigner } from './utils/txHelper'
import chaiAsPromised from 'chai-as-promised'
import { buildContract, mergeModulesIntoBase } from './utils/dynamicContractBuilder'
import ts from 'typescript'
import { myPublicKey } from './utils/privateKey'

import { VMAccountData } from '../src/contracts/modules/dailyValuation'
use(chaiAsPromised)

describe('Test Dynamically Constructed Contract', () => {
    const party1 = myPublicKey
    const party2 = myPublicKey

    let instance: SmartContract

    before(async () => {
        const baseModulePath = require.resolve('../src/contracts/base');
        const baseModuleSourceCode = fs.readFileSync(baseModulePath, 'utf8');

        const dailyValuationModulePath = require.resolve('../src/contracts/modules/dailyValuation');
        const dailyValuationModuleSourceCode = fs.readFileSync(dailyValuationModulePath, 'utf8');

        const baseModuleSourceFile = ts.createSourceFile(
            path.basename(baseModulePath),
            baseModuleSourceCode,
            ts.ScriptTarget.Latest,
            true // Set parent nodes
        );

        const moduleSourceFiles = [
            ts.createSourceFile(
                path.basename(dailyValuationModulePath),
                dailyValuationModuleSourceCode,
                ts.ScriptTarget.Latest,
                true // Set parent nodes
            )
        ]

        // Specify the name of the resulting class
        const resultClassName = 'ScryptDynamicContractDemo'

        // Perform the merge
        const mergedSourceFile = mergeModulesIntoBase(
            baseModuleSourceFile,
            moduleSourceFiles,
            resultClassName
        )

        // Create a printer to serialize the syntax tree back to code
        const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

        // Serialize the transformed syntax tree to a string
        const finalSourceCode = printer.printFile(mergedSourceFile);

        console.log(finalSourceCode)

        const { ScryptDynamicContractDemo } = await buildContract(
            'scryptDynamicContractDemo.ts',
            finalSourceCode
        )
        await ScryptDynamicContractDemo.compile()

        const nullVMAccountData: VMAccountData = {
            txid: toByteString('0000000000000000000000000000000000000000000000000000000000000000') as Sha256,
            balance: 0n
        }

        instance = new ScryptDynamicContractDemo(
            PubKey(party1.toByteString()),
            PubKey(party2.toByteString()),
            nullVMAccountData,
            nullVMAccountData
        )
        await instance.connect(getDefaultSigner())
    })

    it('should call the public method of the dynamically loaded contract successfully.', async () => {
        const deployTx = await instance.deploy(1)
        console.log(
            `Deployed contract "ScryptDynamicContractDemo": ${deployTx.id}`
        )

        const call = async () => {
            const updatedVMData: VMAccountData = {
                txid: toByteString('4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b') as Sha256,
                balance: 5000n
            }

            const nextInstance: any = instance.next()
            nextInstance.vmAccountDataParty1 = updatedVMData

            const callRes = await instance.methods.dailyValuation(
                PubKey(party1.toByteString()),
                (sigResps) => findSig(sigResps, party1),
                updatedVMData,

                {
                    pubKeyOrAddrToSign: party1,
                    next: {
                        instance: nextInstance,
                        balance: 1
                    }
                }
            )

            console.log(`Called "dailyValuationData" method: ${callRes.tx.id}`)
        }
        await expect(call()).not.to.be.rejected
    })
})
