import express from "express";
import bodyParser from "body-parser";
import { dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import env from "dotenv";
import multer from "multer";
//
//

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const port = 3000;
const saltrounds = 10;
env.config();


app.use(
  session({
    secret: "TOPSECRETWORD",
    resave: true,
    saveUninitialized: true,
  })
);


app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));
app.use('/uploads', express.static(__dirname + '/uploads'));
// const upload = multer();


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix);
  }
});


const upload = multer({ storage: storage });

app.use(passport.initialize());
app.use(passport.session());


const db = new pg.Client({
  user: "responsibility_user",
  host: "cslj643qf0us738u3ugg-a.oregon-postgres.render.com",
  database: "responsibility_4fhi",
  password: "IxybLBC1HKGH9cOzRulNybY8rZizdWXj",
  port: 5432,
  ssl: {
    rejectUnauthorized: false, 
  },
});

db.connect();

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
  });

app.get("/about.html", (req, res) => {
    res.sendFile(__dirname + "/about.html");
  });

app.get("/results.html", (req, res) => {
    res.sendFile(__dirname + "/results.html");
  });

app.get("/login", (req, res) => {
    res.render("login.ejs");
  });

app.get("/register", (req, res) => {
    res.render("register.ejs");
});

// raise ka get request taki directly access ke liye
app.get("/raise", (req, res) => {
  // console.log(req.user);
  if (req.isAuthenticated()) {
    res.render("raise.ejs");
  } else {
    res.redirect("/login");
  }
});

// login ka post request
app.post(
  "/submit",
  passport.authenticate("local", {
    successRedirect: "/raise",
    failureRedirect: "/login",
  })
);

// register ka post request
app.post("/register", async (req, res) => {
  const username = req.body.username;
  const name  = req.body.name;
  const email = req.body.email;
  const password = req.body.password;


  try {
    const checkResult = await db.query("SELECT * FROM signup WHERE username = $1", [username]);

    if (checkResult.rows.length > 0) {
      res.send("User already exists. Try logging in.");
    } else {
      bcrypt.hash(password, saltrounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
          const result = await db.query(
            "INSERT INTO signup (username, name, email, password) VALUES ($1, $2, $3, $4)",
            [username, name, email, hash]
            );
          const user = result.rows[0];
          req.login(user, (err) => {
            console.log("success");
            res.redirect("/raise");
          });
        }
      });

    }
  } catch (err) {
    console.log(err);
  }
});



//raise charity ka post request

app.post("/raise", upload.single('image'), async (req, res) => {
  const { Cname, purp, Founder } = req.body;
  console.log(req.body);
  const image = req.file;

  if (!image) {
    return res.status(400).send('No file uploaded.');
  }
  const username = req.user.username; // Get the username of the authenticated user
  console.log(Cname, username);
  try {
    await db.query(
      "INSERT INTO raise (chname, purpose, fname, img, username) VALUES ($1, $2, $3, $4, $5)",
      [Cname, purp, Founder, image.filename, username]
    );
    res.send("Charity raised successfully!");
  } catch (err) {
    console.log(err);
    res.send("Error raising charity.");
  }
});


// display donation after the login ka pages
app.get('/display', async (req, res) => {

  if (!req.isAuthenticated() || !req.user) {
    return res.redirect('/login'); // Redirect to login if user is not authenticated
  }

  const user = req.user.username; // Get the username of the authenticated user

  try {
    // Fetch charities created by the authenticated user
    const charitiesResult = await db.query("SELECT chid, chname FROM raise WHERE username = $1", [user]);
    const charities = [];

    for (let charity of charitiesResult.rows) {
      // Fetch donations for each charity
      const donationsResult = await db.query("SELECT dname, age, gender, nationality, contact, email, amount FROM donationform WHERE chid = $1", [charity.chid]);
      
      // Fetch total amount collected for each charity
      const totalAmountResult = await db.query("SELECT SUM(amount) as totalAmount FROM donationform WHERE chid = $1", [charity.chid]);
      
      // Populate charity information with donations and total amount
      charities.push({
        chName: charity.chname,
        donations: donationsResult.rows,
        totalAmount: totalAmountResult.rows[0].totalamount || 0,
        
      });
    }

    // Render the display.ejs template with the user and charities data
    res.render('display.ejs', { user, charities });
  } catch (err) {
    console.error(err);
    res.send("Error fetching donation data.");
  }
});

// donate page from index.html wala page
// app.get("/donate", async (req, res) => {
//   try {
//     const result = await db.query("SELECT * FROM raise");
//     const charities = result.rows.map(charity => {
//       // Ensure img is a buffer and convert to string
//       if (Buffer.isBuffer(charity.img)) {
//         charity.img = charity.img.toString('utf-8');
//       }
//       return charity;
//     });

//     res.render("donate.ejs", { charities });
//   } catch (err) {
//     console.error(err);
//     res.send("Error fetching charities.");
//   }
// });
app.get("/donate", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM raise");
    const charities = result.rows.map(charity => {
      // Assuming the image filename is stored as a hex string, decode it
      if (typeof charity.img === 'string' && charity.img.startsWith('\\x')) {
        // Remove the `\x` prefix and convert to a string
        const hexString = charity.img.replace(/\\x/g, '');
        const buffer = Buffer.from(hexString, 'hex');
        
        // Convert the Buffer back to the filename string
        charity.img = buffer.toString('utf-8');
      }

      return charity;
    });

    // Pass the processed charities to your front-end
    res.render("donate.ejs", { charities });
  } catch (err) {
    console.error("Error fetching charities:", err);
    res.status(500).send("Server error");
  }
});

app.get("/donateform", async (req, res) => {
  const chid = req.query.chid;

  try {
    const result = await db.query("SELECT * FROM raise WHERE chid = $1", [chid]);
    const charity = result.rows[0];

    if(!charity) {
      return res.send("Charity not found in the Database");
    }

    // Render the donation form page with the chariy details
    res.render("donateform.ejs", {charity});

  } catch (err) {
    console.error(err);
    res.send("Error fetching charity details");
  }
});


app.post("/submitDonation", async (req, res) => {
  const { chid, dName, age, gender, contact, email, nationality, paymentType, amount } = req.body;

  try {
    await db.query(
      "INSERT INTO donationform (chid, dName, age, gender, contact, email, nationality, paymentType, amount) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [chid, dName, age, gender, contact, email, nationality, paymentType, amount]
    );
    res.send("Donation submitted successfully!");
  } catch (err) {
    console.error(err);
    res.send("Error submitting donation.");
  }
});


// logout button ke liye
app.get('/logout', (req, res, next) => {
  // Passport.js logout function
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    // Redirect to the homepage after logout
    res.redirect('/');
  });
});


passport.use(
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * FROM signup WHERE username = $1", [username]

      );
      
      if (result.rows.length > 0) {
        const user = result.rows[0];
        
        const storedHashedPassword = user.password;
        
        bcrypt.compare(password, storedHashedPassword, (err, valid) => {
          console.log(err);
          console.log(valid);
          if (err) {
            //Error with password check
            console.error("Error comparing passwords:", err);
            return cb(err);
          } else {
            if (valid) {
              //Passed password check
              console.log("password check success and matched");
              return cb(null, user);
            } else {
              //Did not pass password check
              console.log("Password Not matched");
              return cb(null, false);
            }
          }
        });
      } else {
        return cb("User not found");
      }
    } catch (err) {
      console.log(err);
    }
  })
);



passport.serializeUser((user, cb) => {
  cb(null, user);
});
passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
