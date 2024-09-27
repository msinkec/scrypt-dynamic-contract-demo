import { prop, PubKey, SmartContract } from 'scrypt-ts'

export class ModularSmartContractBase extends SmartContract {

    @prop()
    party1: PubKey

    @prop()
    party2: PubKey

    constructor(
        party1: PubKey,
        party2: PubKey
    ) {
        super(...arguments)
        this.party1 = party1
        this.party2 = party2
    }

}
