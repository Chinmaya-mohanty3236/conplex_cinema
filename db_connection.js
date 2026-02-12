import dotenv from "dotenv";

dotenv.config();
import mysql from "mysql2/promise";
import fs from "fs";


let data = JSON.parse(fs.readFileSync("datas/movie_list_db.json", "utf-8"));
export async function dbConnection(){
  const connection = await mysql.createConnection({
      host:process.env.DATABASE_HOST,
      user:process.env.DATABASE_USER,
      password:process.env.DATABASE_PASSWORD,
      database:process.env.DATABASE_NAME
    });
    return connection;
}

async function insertMovies() {
  const connect = await dbConnection();
  try {
    for (let movie of data) {
      await connect.execute(
        `INSERT INTO movies (title, description, duration, language, poster_url, release_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          movie.title,
          movie.description,
          movie.duration,
          movie.language,
          movie.poster_url,
          movie.release_date,
          movie.status
        ]
      );
      console.log(`✅ Inserted: ${movie.title}`);
    }

    await connect.end();
    console.log("All movies inserted successfully!");
  } catch (err) {
    console.error("Error inserting movies:", err.message);
  }
}

insertMovies();
