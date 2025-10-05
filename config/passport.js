const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const db = require("./database");
const { v4: uuidv4 } = require("uuid");
const { createServiceLogger } = require("../utils/logger");

const logger = createServiceLogger("config");

// Validate required environment variables
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) {
  logger.error("Missing required Google OAuth credentials");
  throw new Error("Google OAuth credentials not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL in environment variables.");
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const selectByGoogleId = `SELECT * FROM users WHERE googleId = ?`;

        db.get(selectByGoogleId, [profile.id], (err, existingUser) => {
          if (err) {
            logger.error("Database error:", err);
            return done(err, null);
          }

          if (existingUser) {
            logger.info("Existing Google user found:", existingUser.email);
            return done(null, existingUser);
          }

          const selectByEmail = `SELECT * FROM users WHERE email = ?`;
          const email = profile.emails[0].value;

          db.get(selectByEmail, [email], (err, userWithEmail) => {
            if (err) {
              logger.error("Database error:", err);
              return done(err, null);
            }

            if (userWithEmail) {
              const updateSql = `UPDATE users SET googleId = ?, provider = ?, displayName = ?, avatar = ?, verified = 1 WHERE email = ?`;
              const updateParams = [
                profile.id,
                "google",
                profile.displayName,
                profile.photos[0]?.value || null,
                email,
              ];

              db.run(updateSql, updateParams, function (err) {
                if (err) {
                  logger.error("Database update error:", err);
                  return done(err, null);
                }

                logger.info("Updated existing user with Google info:", email);

                db.get(selectByEmail, [email], (err, updatedUser) => {
                  if (err) return done(err, null);
                  return done(null, updatedUser);
                });
              });
            } else {
              const insertSql = `INSERT INTO users (id, email, googleId, provider, displayName, avatar, verified, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
              const newUserId = uuidv4();
              const insertParams = [
                newUserId,
                email,
                profile.id,
                "google",
                profile.displayName,
                profile.photos[0]?.value || null,
                1,
                new Date().toISOString(),
              ];

              db.run(insertSql, insertParams, function (err) {
                if (err) {
                  logger.error("Database insert error:", err);
                  return done(err, null);
                }

                logger.info(`[CONFIG] Created new Google user: ${email}`);

                db.get(selectByEmail, [email], (err, newUser) => {
                  if (err) return done(err, null);
                  return done(null, newUser);
                });
              });
            }
          });
        });
      } catch (error) {
        logger.error("Google Strategy error:", error);
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  const sql = `SELECT * FROM users WHERE id = ?`;
  db.get(sql, [id], (err, user) => {
    if (err) {
      logger.error("Passport deserialize error:", err);
      return done(err, null);
    }
    done(null, user);
  });
});

module.exports = passport;