import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createPasswordHash } from "../shared/password";

const readline = createInterface({ input, output });
try {
  const password = await readline.question("Admin password (12+ characters): ");
  const confirmation = await readline.question("Confirm admin password: ");
  if (password !== confirmation) throw new Error("Passwords do not match.");
  console.log(await createPasswordHash(password));
} finally {
  readline.close();
}
