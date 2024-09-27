import { assert, hash256, method, prop, PubKey, Sha256, Sig } from "scrypt-ts";
import { ModularSmartContractBase } from "../base"

export type VMAccountData = {
    txid: Sha256,
    balance: bigint
}

export class DailyValuationModule extends ModularSmartContractBase {

    @prop(true)
    vmAccountDataParty1: VMAccountData

    @prop(true)
    vmAccountDataParty2: VMAccountData
    
    @method()
    public dailyValuation(
        pubKey: PubKey,
        sig: Sig,
        updatedVMAccountData: VMAccountData
    ) {
        assert(
            pubKey == this.party1 || pubKey == this.party2,
            'unknown public key'
        )
        assert(this.checkSig(sig, pubKey))

        if (pubKey == this.party1) {
            this.vmAccountDataParty1 = updatedVMAccountData
        } else {
            this.vmAccountDataParty2 = updatedVMAccountData
        }

        const outputs = this.buildStateOutput(1n) + this.buildChangeOutput()
        assert(hash256(outputs) == this.ctx.hashOutputs, 'hashOutputs mismatch')
    }

}
