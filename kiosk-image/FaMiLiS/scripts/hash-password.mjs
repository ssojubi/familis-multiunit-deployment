/**
 * Print a bcrypt hash for pasting into SQL or manual INSERTs.
 * Usage: npm run hash-password -- yourPlainPassword
 */
import bcrypt from "bcryptjs";

const plain = process.argv.slice(2).join(" ").trim();
if (!plain) {
  console.error("Usage: npm run hash-password -- <plaintext password>");
  process.exit(1);
}

const hash = await bcrypt.hash(plain, 10);
console.log(hash);
