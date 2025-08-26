const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('./database');
const { v4: uuidv4 } = require('uuid');


passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
     
      const selectByGoogleId = `SELECT * FROM users WHERE googleId = ?`;
      
      db.get(selectByGoogleId, [profile.id], (err, existingUser) => {
        if (err) {
          console.error('Database error:', err);
          return done(err, null);
        }

        if (existingUser) {
         
          console.log('Existing Google user found:', existingUser.email);
          return done(null, existingUser);
        }

       
        const selectByEmail = `SELECT * FROM users WHERE email = ?`;
        const email = profile.emails[0].value;
        
        db.get(selectByEmail, [email], (err, userWithEmail) => {
          if (err) {
            console.error('Database error:', err);
            return done(err, null);
          }

          if (userWithEmail) {
           
            const updateSql = `UPDATE users SET googleId = ?, provider = ?, displayName = ?, avatar = ?, verified = 1 WHERE email = ?`;
            const updateParams = [
              profile.id,
              'google',
              profile.displayName,
              profile.photos[0]?.value || null,
              email
            ];

            db.run(updateSql, updateParams, function(err) {
              if (err) {
                console.error('Database update error:', err);
                return done(err, null);
              }

              console.log('Updated existing user with Google info:', email);
              
             
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
              'google',
              profile.displayName,
              profile.photos[0]?.value || null,
              1, 
              new Date().toISOString()
            ];

            db.run(insertSql, insertParams, function(err) {
              if (err) {
                console.error('Database insert error:', err);
                return done(err, null);
              }

              console.log('Created new Google user:', email);
              
             
              db.get(selectByEmail, [email], (err, newUser) => {
                if (err) return done(err, null);
                return done(null, newUser);
              });
            });
          }
        });
      });
    } catch (error) {
      console.error('Google Strategy error:', error);
      return done(error, null);
    }
  }
));


passport.serializeUser((user, done) => {
  done(null, user.id);
});


passport.deserializeUser((id, done) => {
 
  const sql = `SELECT * FROM users WHERE id = ?`;
  db.get(sql, [id], (err, user) => {
    if (err) {
      console.error('Passport deserialize error:', err);
      return done(err, null);
    }
    done(null, user);
  });
});

module.exports = passport;
