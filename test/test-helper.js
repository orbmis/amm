const toWei = amount => BigInt(amount) * (10n ** 18n)

// https://stackoverflow.com/a/53684036/1786712
function sqrt(value) {
  if (value < 0n) {
    throw 'square root of negative numbers is not supported'
  }

  if (value < 2n) {
    return value
  }

  const newtonIteration = (n, x0) => {
    const x1 = ((n / x0) + x0) >> 1n

    if (x0 === x1 || x0 === (x1 - 1n)) {
      return x0
    }

    return newtonIteration(n, x1)
  }

  return newtonIteration(value, 1n)
}


// A Human-Readable ABI; for interacting with the contract, we
// must include any fragment we wish to use
const erc20Abi = [
  // Read-Only Functions
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",

  // Authenticated Functions
  "function transfer(address to, uint amount) returns (bool)",

  // Events
  "event Transfer(address indexed from, address indexed to, uint amount)"
]


module.exports = { toWei, sqrt, erc20Abi }