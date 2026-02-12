import express from "express";
import path from "path";
import mysql2 from "mysql2";
import dotenv from "dotenv";
import flash from "connect-flash";
import argon2 from "argon2";
import passport  from "passport";
import {Strategy as LocalStrategy} from "passport-local";
import session from "express-session";
import QRCode from "qrcode";
dotenv.config();
const app = express();
const port = 3000;
app.set("view engine","ejs");
app.set("views",path.join(import.meta.dirname,"views"));

app.use(express.static(path.join(import.meta.dirname,"publics")));
const connection = mysql2.createConnection({
    host:process.env.DATABASE_HOST,
    user:process.env.DATABASE_USER,
    password:process.env.DATABASE_PASSWORD,
    database:process.env.DATABASE_NAME
});
app.use(express.urlencoded({extended:true}));
app.use(express.json());


app.use(session({
    secret:process.env.SECRET_KEY,
    resave:false,
    saveUninitialized:true,
    cookie:{
        maxAge:7*24*60*60*1000,
        httpOnly:true
    }
}))
app.use(passport.initialize());
app.use(passport.session());
app.use((req,res,next)=>{
    res.locals.currentUser = req.user || null;
    next();
})
app.use(flash());
passport.use(new LocalStrategy(
  { usernameField: "email" },
  async (email, password, done) => {
    const query = "SELECT * FROM User WHERE email = ?";

    connection.query(query, [email], async (err, results) => {
      if (err) return done(err);

      if (results.length === 0) {
        return done(null, false, { message: "User not found" });
      }

      const user = results[0];

      try {
        const match = await argon2.verify(user.password, password);

        if (!match) {
          return done(null, false, { message: "Incorrect password" });
        }

        return done(null, user);

      } catch (error) {
        return done(error);
      }
    });
  }
));
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  connection.query("SELECT * FROM User WHERE id = ?", [id], (err, results) => {
    if (err) return done(err);
    done(null, results[0]);
  });
});

const isAdmin = (req, res, next) => {
    if (req.isAuthenticated() && req.user.role === "admin") {
        return next();
    }

    req.flash("error", "Admin access only");
    res.redirect("/");
};

let isAuthenticate = (req,res,next)=>{
    if (req.isAuthenticated()) return next();
    req.flash("error", "You must be logged in first");
    res.redirect("/login");
}
app.use((req, res, next) => {
  res.locals.error = req.flash("error");
  res.locals.success = req.flash("success");
  
  next();
});


app.get("/",async (req,res)=>{
    let query_showing = `select * from movies where status="now_showing"`;
    let query_upcoming = `select * from movies where status="upcoming"`;
    try{
        connection.query(query_showing,(err,result)=>{
            if(err) throw err;
            connection.query(query_upcoming,(err,result2)=>{
                if(err) throw err;
                res.render("welcome.ejs",{ result:result,result2:result2 });
            })
            
        })
    
    }
    catch(err)
    {
        console.log("Error is ",err.message);
    }
    
})
app.get("/login",(req,res)=>{
    res.render("login.ejs");
})

app.post("/login",passport.authenticate("local",
    {failureRedirect: "/login",
    failureFlash:true
  }),(req,res)=>{
    req.flash("success","Welcome Back Buddy");
    res.redirect("/");
})

app.get("/admin/dashboard", isAdmin, (req, res) => {
    res.render("admin/dashboard.ejs");
});

app.get("/register",(req,res)=>{
    res.render("register.ejs");
})

app.post("/register/new", async (req, res) => {
    let { name, email, role, password } = req.body;

    let query = `INSERT INTO User (name, email, password, role) VALUES (?, ?, ?, ?)`;

    try {
        let hashed_pass = await argon2.hash(password);

        connection.query(query, [name, email, hashed_pass, role], (err, result) => {

            if (err) {
                console.log("DB Error:", err.message);
                req.flash("error", "Registration Failed");
                return res.redirect("/register");
            }

            req.flash("success", "Registered Successfully");
            console.log("Insert Result:", result);

            res.redirect("/login");
        });

    } catch (err) {
        console.log("Hashing/Error:", err.message);
        req.flash("error", "Something went wrong");
        res.redirect("/register");
    }
});
app.get("/movies/:id",isAuthenticate,(req,res)=>{
    let id = req.params.id;
    let query = `select * from movies where id = ?`;
    let query_show = `SELECT * FROM shows WHERE movie_id = ?`
    try{
        connection.query(query,[id],(err,result)=>{
        if(err) throw err;
        connection.query(query_show,[id],(err,show)=>{
            if(err) throw err;
            res.render("movie.ejs",{movie:result[0],shows:show});
        })
    })
    }
    catch(err){
        console.log("Error is ",err.message);
    }
})
app.get("/admin/shows", isAdmin, (req, res) => {

    const movieQuery = "SELECT id, title FROM movies";
    const screenQuery = "SELECT id, screen_name FROM screens";

    connection.query(movieQuery, (err, movies) => {
        if (err) throw err;

        connection.query(screenQuery, (err, screens) => {
            if (err) throw err;

            res.render("admin/add_show.ejs", { movies, screens });
        });
    });
});
app.post("/admin/shows/new", isAdmin, (req, res) => {

    const { movie_id, screen_id, show_date, show_time, price } = req.body;

    const insertQuery = `
        INSERT INTO shows (movie_id, screen_id, show_date, show_time, price)
        VALUES (?, ?, ?, ?, ?)
    `;

    connection.query(
        insertQuery,
        [movie_id, screen_id, show_date, show_time, price],
        (err, result) => {

            if (err) {
                console.log("Insert Error:", err.message);
                req.flash("error", "Failed to add show");
                return res.redirect("/admin/shows/new");
            }

            req.flash("success", "🎉 Show Added Successfully!");
            res.redirect("/admin/dashboard");
        }
    );
});

app.get("/shows/:id/seats", isAuthenticate, (req, res) => {
    const showId = req.params.id;

    const seatsQuery = `SELECT s.id, s.seat_number,CASE 
            WHEN bs.seat_id IS NOT NULL THEN 'booked'
            ELSE 'available'
        END AS status
        FROM seats s
        LEFT JOIN booking_seat bs 
        ON s.id = bs.seat_id
        LEFT JOIN ticket_booking b
        ON bs.booking_id = b.id
        WHERE b.show_id = ? OR b.show_id IS NULL
    `;
    const showQuery = `SELECT * FROM shows WHERE id = ?`;
    connection.query(showQuery, [showId], (err, shows) => {
        if (err) throw err;

        const show = shows[0];

        connection.query(seatsQuery, [showId], (err, seats) => {
            if (err) throw err;

            res.render("seat_selection.ejs", { show, seats });
        });
    });
});
app.post("/bookings/new", isAuthenticate, (req, res) => {

    const userId = req.user.id;
    const { show_id, seat_ids } = req.body;

    if (!seat_ids || seat_ids.length === 0) {
        req.flash("error", "No seats selected");
        return res.redirect("back");
    }

    const seatsArray = seat_ids.split(",");

    connection.beginTransaction(err => {
        if (err) throw err;

        
        const checkQuery = `
            SELECT * FROM booking_seat bs
            JOIN ticket_booking b ON bs.booking_id = b.id
            WHERE b.show_id = ?
            AND bs.seat_id IN (?)
        `;

        connection.query(checkQuery, [show_id, seatsArray], (err, results) => {

            if (err) {
                return connection.rollback(() => {
                    console.log("Check Error:", err.message);
                    res.send("Error checking seats");
                });
            }

            if (results.length > 0) {
                return connection.rollback(() => {
                    req.flash("error", "Some seats already booked!");
                    res.redirect("back");
                });
            }

           
            connection.query(
                "SELECT price FROM shows WHERE id = ?",
                [show_id],
                (err, showResult) => {

                    if (err) {
                        return connection.rollback(() => {
                            console.log(err.message);
                        });
                    }

                    const price = showResult[0].price;
                    const totalAmount = price * seatsArray.length;

                   
                    connection.query(
                        "INSERT INTO ticket_booking (user_id, show_id, total_amount) VALUES (?, ?, ?)",
                        [userId, show_id, totalAmount],
                        (err, bookingResult) => {

                            if (err) {
                                return connection.rollback(() => {
                                    console.log("Booking Insert Error:", err.message);
                                });
                            }

                            const bookingId = bookingResult.insertId;

                           
                            const seatInsertQuery = `
                                INSERT INTO booking_seat (booking_id, seat_id)
                                VALUES ?
                            `;

                            const values = seatsArray.map(seatId => [bookingId, seatId]);

                            connection.query(seatInsertQuery, [values], (err) => {

                                if (err) {
                                    return connection.rollback(() => {
                                        console.log("Seat Insert Error:", err.message);
                                    });
                                }

                                
                                connection.commit(err => {

                                    if (err) {
                                        return connection.rollback(() => {
                                            console.log("Commit Error:", err.message);
                                        });
                                    }

                                    req.flash("success", "Booking Confirmed!");
                                    res.redirect("/my-bookings");
                                });
                            });
                        }
                    );
                }
            );
        });
    });
});

app.get("/my-bookings", isAuthenticate, (req, res) => {

    const userId = req.user.id;

    const query = `
        SELECT 
            tb.id,
            m.title,
            s.show_date,
            s.show_time,
            tb.total_amount
        FROM ticket_booking tb
        JOIN shows s ON tb.show_id = s.id
        JOIN movies m ON s.movie_id = m.id
        WHERE tb.user_id = ?
        ORDER BY tb.id DESC
    `;

    connection.query(query, [userId], (err, bookings) => {
        if (err) {
            console.log(err.message);
            return res.send("DB Error");
        }

        res.render("my_bookings.ejs", { bookings });
    });
});

app.get("/ticket/:id", isAuthenticate, async (req, res) => {

    const bookingId = req.params.id;

    const query = `
        SELECT 
            tb.id,
            m.title,
            s.show_date,
            s.show_time,
            s.screen_id,
            GROUP_CONCAT(se.seat_number) AS seats,
            tb.total_amount
        FROM ticket_booking tb
        JOIN shows s ON tb.show_id = s.id
        JOIN movies m ON s.movie_id = m.id
        JOIN booking_seat bs ON tb.id = bs.booking_id
        JOIN seats se ON bs.seat_id = se.id
        WHERE tb.id = ?
        GROUP BY tb.id
    `;

    connection.query(query, [bookingId], async (err, result) => {
        if (err) return res.send("Error");

        const ticket = result[0];

        const qrData = `Booking#${ticket.id} | ${ticket.title} | Seats: ${ticket.seats}`;
        const qrImage = await QRCode.toDataURL(qrData);

        res.render("ticket.ejs", { ticket, qrImage });
    });
});


app.get("/logout", (req, res) => {
  req.logout(function(err) {
    if (err) { return next(err); }
    req.flash("success", "Logged out successfully");
    res.redirect("/login");
  });
});

app.listen(port,()=>{
    console.log(`The Server is running at port no. ${port}`);
})