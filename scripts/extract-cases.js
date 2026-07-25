const pg = require("pg");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const ids = [
  "f715e49b-4ee2-4e28-bf49-a6b5eb39be72",  // 904/3448/25 - PoA invalidation
  "63472bed-64c0-4b9e-a2ec-7b2ea9d54bee",  // 925/847/23 - bankruptcy arrests
  "4fccdd0f-7d26-4a9b-8c8b-b9ea189f5c59",  // 495/9923/22 - lifting arrest
  "0d7b66af-51cd-4c20-b845-6b25448a93cc",  // 910/862/22 - contract invalidation
  "73df3cf4-f7f2-42fe-9b2b-eb0ae5041b48",  // 927/1053/25 - credit assignment
];

async function main() {
  for (const id of ids) {
    const r = await pool.query(
      "SELECT title, case_number, LEFT(full_text, 4000) as excerpt FROM documents WHERE id = $1",
      [id]
    );
    if (r.rows.length) {
      console.log("\n===== " + r.rows[0].case_number + " | " + r.rows[0].title + " =====");
      console.log(r.rows[0].excerpt);
      console.log("\n---END---");
    }
  }
  await pool.end();
}
main().catch(e => { console.error(e); pool.end(); });
