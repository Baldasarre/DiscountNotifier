const express = require("express");
const passport = require("../config/passport");
const { setSessionCookie } = require("../utils/helpers");
const { createServiceLogger } = require("../utils/logger");

const logger = createServiceLogger("auth");
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
        logger.error("Google auth callback: User not found");
        return res.redirect("/login?error=user_not_found");
      }

      setSessionCookie(res, user.id);

      // Update lastLoginAt and IP
      const db = require("../config/database");
      const updateLoginSql = `UPDATE users SET lastLoginAt = ?, ip = ? WHERE id = ?`;
      const userIp = req.ip || req.connection.remoteAddress;
      logger.info(`[USER-LOGIN] Updating IP for user ${user.id}: ${userIp}`);
      db.run(updateLoginSql, [new Date().toISOString(), userIp, user.id], (err) => {
        if (err) {
          logger.error("Failed to update lastLoginAt:", err);
        } else {
          logger.info(`[USER-LOGIN] Successfully updated lastLoginAt and IP`);
        }
      });

      logger.info(`[USER-LOGIN] Google Auth successful - Email: ${user.email}, ID: ${user.id}, IP: ${req.ip}`);

      const hasBrands =
        user.brands && user.brands !== "null" && user.brands !== "[]";

      if (user.category && hasBrands) {
        logger.info("User has complete profile, redirecting to dashboard");
        res.redirect("/dashboard");
      } else {
        logger.info("️ User profile incomplete, redirecting to category selection");
        res.redirect("/category");
      }
    } catch (error) {
      logger.error("Google callback error:", error);
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
      logger.error("Google status check error:", err);
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