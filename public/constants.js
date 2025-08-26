export const DELAYS = {
  REDIRECT_SHORT: 1000,
  REDIRECT_LONG: 2000,
  BRAND_SAVE: 3000,
  GENDER_SELECTION: 500,
  BUTTON_ANIMATION: 150,
  UI_TRANSITION: 350,
  MENU_REDIRECT: 500,
};

export const COLORS = {
  BRAND_SELECTED: "#f88379",
  BRAND_DEFAULT: "transparent",
  BUTTON_DISABLED: "0.6",
  BUTTON_LOADING: "0.5",
};

export const ROUTES = {
  INDEX: "/",
  CATEGORY: "/category",
  DASHBOARD: "/dashboard",
};

export const API_ENDPOINTS = {
  SAVE: "/api/save",
  VERIFY_CODE: "/api/verify-code",
  UPDATE_USER: "/api/update-user",
  USER_INFO: "/api/user-info",
  CHECK_SESSION: "/api/check-session",
  CSRF_TOKEN: "/api/csrf-token",
  LOGOUT: "/api/logout",
};

export const COOKIE_CONFIG = {
  SESSION_DURATION: 1000 * 60 * 60 * 24 * 7,
  HTTP_ONLY: true,
  SECURE: false,
  SAME_SITE: "Lax",
  PATH: "/",
};

export const ERROR_MESSAGES = {
  EMAIL_EMPTY: "E-posta adresi boş olamaz!",
  EMAIL_INVALID: "Geçerli bir e-posta adresi giriniz!",
  CODE_INVALID: "6 haneli kodu doğru girin!",
  NETWORK_ERROR: "İnternet bağlantınızı kontrol edin",
  SERVER_ERROR: "Sunucu hatası, lütfen tekrar deneyin",
  RATE_LIMIT: "Çok fazla deneme yaptınız, lütfen bekleyin",
  UNKNOWN_ERROR: "Beklenmeyen hata: ",
  VERIFICATION_FAILED: "Doğrulama başarısız.",
  CODE_CHECK_ERROR: "Kod kontrolünde hata!",
};

export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: "Başarıyla giriş yapıldı!",
  REDIRECTING: "Kullanıcı sayfanıza yönlendiriliyorsunuz...",
  CATEGORY_REDIRECT: "Kategori seçimine yönlendiriliyor...",
  SESSION_ACTIVE: "Oturum aktif. Giriş yapılıyor...",
};

export const UI_STATES = {
  MENU_HIDDEN: "menu-hidden",
  MENU_VISIBLE: "menu-visible",
  TAB_ACTIVE: "tab-2-active",
  BUTTON_CLICKED: "buttonClicked",
  VISIBLE: "visible",
};
