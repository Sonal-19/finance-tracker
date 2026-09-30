import { DATABASE_URL } from "../env";

export async function connectionTest() {
  const testClient = new Bun.SQL(DATABASE_URL, { max: 1 });
  try {
    await testClient`SELECT 1`;
    await testClient.close();
    console.info("Database connection successful");
    return true;
  } catch (error) {
    console.error("Database connection failed:", error);
    return false;
  }
}
