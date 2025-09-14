const express = require("express");
const passport = require("../config/passport");
const { setSessionCookie } = require("../utils/helpers");
const router = express.Router();

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    session: false,
    failureRedirect: "/login?error=google_auth_failed",
  }),
  (req, res) => {
    try {
      const user = req.user;

      if (!user) {
        console.error("Google auth callback: User not found");
        return res.redirect("/login?error=user_not_found");
      }

      setSessionCookie(res, user.id);

      console.log("Google Auth successful for user:", user.email);

      const hasBrands =
        user.brands && user.brands !== "null" && user.brands !== "[]";

      if (user.gender && hasBrands) {
        console.log("✅ User has complete profile, redirecting to dashboard");
        res.redirect("/dashboard?auth=google_success");
      } else {
        console.log(
          "⚠️ User profile incomplete, redirecting to category selection"
        );
        res.redirect("/category?auth=google_success&first_time=true");
      }
    } catch (error) {
      console.error("Google callback error:", error);
      res.redirect("/login?error=auth_error");
    }
  }
);

router.get("/google/status", (req, res) => {
  const sessionId = req.cookies.sessionId;

  if (!sessionId) {
    return res.json({
      success: false,
      error: "No session found",
    });
  }

  const db = require("../config/database");
  const sql = `SELECT * FROM users WHERE id = ? AND verified = 1`;

  db.get(sql, [sessionId], (err, user) => {
    if (err) {
      console.error("Google status check error:", err);
      return res.status(500).json({
        success: false,
        error: "Database error",
      });
    }

    if (!user) {
      res.clearCookie("sessionId");
      return res.json({
        success: false,
        error: "Invalid session",
      });
    }

    res.json({
      success: true,
      user: {
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        provider: user.provider,
        isGoogleUser: user.provider === "google",
      },
    });
  });
});

module.exports = router;
