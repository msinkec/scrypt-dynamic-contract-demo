import { assert, method, prop, SmartContract } from 'scrypt-ts'

export class Demo extends SmartContract {
    @prop()
    a: bigint

    @prop()
    b: bigint

    constructor(a: bigint, b: bigint) {
        super(...arguments)
        this.a = a
        this.b = b
    }

    @method()
    public unlock(x: bigint) {
        assert(this.a + this.b == x)
    }
}
