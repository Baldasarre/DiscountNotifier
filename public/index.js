import { fetchWithCsrf } from "./apis.js";
import {
  DELAYS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  ROUTES,
  API_ENDPOINTS,
  UI_STATES,
} from "./constants.js";
import {
  DOMUtils,
  ErrorHandler,
  ValidationUtils,
  StorageUtils,
} from "./utils.js";

const signInButton = document.getElementById("signInButton");
const emailInput = document.getElementById("emailInput");
const sendItButton = document.getElementById("sendIt");

let mode = "email";
let currentEmail = "";

async function handleSubmission() {
  const value = emailInput.value.trim();

  if (mode === "email") {
    if (ValidationUtils.isEmpty(value)) {
      showMessage(ERROR_MESSAGES.EMAIL_EMPTY);
      return;
    }
    if (!ValidationUtils.isValidEmail(value)) {
      showMessage(ERROR_MESSAGES.EMAIL_INVALID);
      return;
    }

    try {
      const response = await fetchWithCsrf(API_ENDPOINTS.SAVE, "POST", {
        email: value,
      });
      console.log("Save response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Save error response:", errorText);
        throw new Error(`Server hatası (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      console.log("Save result:", result);

      if (result.success) {
        currentEmail = value;
        StorageUtils.set("userEmail", currentEmail);
        showMessage(result.message);
        DOMUtils.setValue("emailInput", "");
        DOMUtils.setPlaceholder("emailInput", "6 haneli kodu girin");
        mode = "code";
      } else {
        showMessage("Sunucu hatası: " + (result.error || "Bilinmeyen hata"));
      }
    } catch (err) {
      ErrorHandler.handle(err, "emailSubmission");
      showErrMessage(
        ErrorHandler.categorizeError(err) === "NETWORK_ERROR"
          ? ERROR_MESSAGES.NETWORK_ERROR
          : ERROR_MESSAGES.SERVER_ERROR
      );
    }
  } else if (mode === "code") {
    const code = value;
    if (!ValidationUtils.isValidCode(code)) {
      showMessage(ERROR_MESSAGES.CODE_INVALID);
      return;
    }

    try {
      const response = await fetchWithCsrf(API_ENDPOINTS.VERIFY_CODE, "POST", {
        email: currentEmail,
        code,
      });
      const result = await response.json();

      if (result.success) {
        showMessage(SUCCESS_MESSAGES.LOGIN_SUCCESS);
        DOMUtils.setDisabled("sendIt", true);
        setTimeout(() => {
          showMessage(SUCCESS_MESSAGES.REDIRECTING);
        }, DELAYS.REDIRECT_LONG);
        setTimeout(() => {
          window.location.href = ROUTES.CATEGORY;
        }, DELAYS.REDIRECT_LONG * 2);
      } else {
        showMessage(result.error || ERROR_MESSAGES.VERIFICATION_FAILED);
      }
    } catch (err) {
      ErrorHandler.handle(err, "codeVerification");
      showMessage(ERROR_MESSAGES.CODE_CHECK_ERROR);
    }
    DOMUtils.setValue("emailInput", "");
  }
}

window.addEventListener("DOMContentLoaded", async () => {

  initializeGoogleAuth();
  
  try {
    const res = await fetch(API_ENDPOINTS.CHECK_SESSION, {
      credentials: "include",
    });
    const data = await res.json();
    if (data.loggedIn) {
      DOMUtils.setText("signInButton", SUCCESS_MESSAGES.SESSION_ACTIVE);
      DOMUtils.setDisabled("signInButton", true);
      DOMUtils.getElement("signInButton").style.cursor = "wait";

      try {
        const userInfoRes = await fetch(API_ENDPOINTS.USER_INFO, {
          credentials: "include",
        });
        const userInfo = await userInfoRes.json();

        if (userInfo.success && userInfo.gender) {
          DOMUtils.setText("signInButton", SUCCESS_MESSAGES.REDIRECTING);
          setTimeout(() => {
            window.location.href = ROUTES.DASHBOARD;
          }, DELAYS.REDIRECT_LONG);
        } else {
          DOMUtils.setText("signInButton", SUCCESS_MESSAGES.CATEGORY_REDIRECT);
          setTimeout(() => {
            window.location.href = ROUTES.CATEGORY;
          }, DELAYS.REDIRECT_SHORT);
        }
      } catch (err) {
        console.error("User info kontrol hatası:", err);
        setTimeout(() => {
          window.location.href = ROUTES.CATEGORY;
        }, DELAYS.REDIRECT_LONG);
      }
    }
  } catch (err) {
    console.error("Oturum kontrol hatası:", err);
  }
});

signInButton.addEventListener("click", (event) => {
  event.preventDefault();
  DOMUtils.addClass("signInButton", UI_STATES.BUTTON_CLICKED);
  setTimeout(
    () => DOMUtils.removeClass("signInButton", UI_STATES.BUTTON_CLICKED),
    DELAYS.BUTTON_ANIMATION
  );
  setTimeout(() => {
    DOMUtils.hideElement("signInButton");
    DOMUtils.showElement("emailInput");
    DOMUtils.addClass("sendIt", UI_STATES.VISIBLE);
    emailInput.focus();
  }, DELAYS.UI_TRANSITION);
});

sendItButton.addEventListener("click", (event) => {
  event.preventDefault();
  DOMUtils.addClass("sendIt", UI_STATES.BUTTON_CLICKED);
  setTimeout(
    () => DOMUtils.removeClass("sendIt", UI_STATES.BUTTON_CLICKED),
    DELAYS.BUTTON_ANIMATION
  );
  handleSubmission();
});

emailInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    handleSubmission();
  }
});

function showMessage(msg) {
  DOMUtils.setValue("emailInput", "");
  DOMUtils.setPlaceholder("emailInput", msg);
  DOMUtils.setDisabled("emailInput", false);
  emailInput.blur();
}

function showErrMessage(msg) {
  DOMUtils.setValue("emailInput", "");
  DOMUtils.setPlaceholder("emailInput", msg);
  DOMUtils.setDisabled("emailInput", true);
}


function initializeGoogleAuth() {
  const googleAuthSection = document.getElementById("googleAuthSection");
  const googleSignInButton = document.getElementById("googleSignInButton");


  if (googleAuthSection) {
    googleAuthSection.style.display = "flex";
  }


  if (googleSignInButton) {
    googleSignInButton.addEventListener("click", (event) => {
      event.preventDefault();
      handleGoogleSignIn();
    });
  }


  checkAuthStatus();
}

function handleGoogleSignIn() {
  try {

    window.location.href = "/auth/google";
  } catch (error) {
    console.error("Google Sign-In error:", error);
    showMessage("Google ile giriş sırasında bir hata oluştu.");
  }
}

function checkAuthStatus() {
  const urlParams = new URLSearchParams(window.location.search);
  const authStatus = urlParams.get("auth");
  const error = urlParams.get("error");

  if (error) {
    let errorMessage = "Giriş sırasında bir hata oluştu.";
    
    switch (error) {
      case "google_auth_failed":
        errorMessage = "Google ile giriş başarısız oldu.";
        break;
      case "user_not_found":
        errorMessage = "Kullanıcı bulunamadı.";
        break;
      case "auth_error":
        errorMessage = "Kimlik doğrulama hatası.";
        break;
    }
    
    showErrMessage(errorMessage);
  }
}

