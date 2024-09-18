import { expect, use } from 'chai'
import { sha256, SmartContract, toByteString } from 'scrypt-ts'
import { getDefaultSigner } from './utils/txHelper'
import chaiAsPromised from 'chai-as-promised'
import { buildContract } from './utils/dynamicContractBuilder'
use(chaiAsPromised)

describe('Test Dynamically Constructed Contract', () => {
    let instance: SmartContract

    before(async () => {
        const dynamicCode = `
import {
    assert,
    ByteString,
    method,
    prop,
    sha256,
    Sha256,
    SmartContract,
} from 'scrypt-ts'

export class ScryptDynamicContractDemo extends SmartContract {
    @prop()
    hash: Sha256

    constructor(hash: Sha256) {
        super(...arguments)
        this.hash = hash
    }

    @method()
    public unlock(message: ByteString) {
        assert(sha256(message) == this.hash, 'Hash does not match')
    }
}

        `

        const dynamicFileName = 'scryptDynamicContractDemo.ts'

        const { ScryptDynamicContractDemo } = await buildContract(
            dynamicFileName,
            dynamicCode
        )
        await ScryptDynamicContractDemo.compile()

        instance = new ScryptDynamicContractDemo(
            sha256(toByteString('Hello dynamic contracts!', true))
        )
        await instance.connect(getDefaultSigner())
    })

    it('should call the public method of the dynamically loaded contract successfully.', async () => {
        const deployTx = await instance.deploy(1)
        console.log(
            `Deployed contract "ScryptDynamicContractDemo": ${deployTx.id}`
        )

        const call = async () => {
            const callRes = await instance.methods.unlock(
                toByteString('Hello dynamic contracts!', true)
            )

            console.log(`Called "unlock" method: ${callRes.tx.id}`)
        }
        await expect(call()).not.to.be.rejected
    })
})
