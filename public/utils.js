// DOM Utility Functions
export const DOMUtils = {
  getElement(id) {
    return document.getElementById(id);
  },

  getElements(selector) {
    return document.querySelectorAll(selector);
  },

  showElement(id) {
    const element = this.getElement(id);
    if (element) element.style.display = 'flex';
  },

  hideElement(id) {
    const element = this.getElement(id);
    if (element) element.style.display = 'none';
  },

  addClass(id, className) {
    const element = this.getElement(id);
    if (element) element.classList.add(className);
  },

  removeClass(id, className) {
    const element = this.getElement(id);
    if (element) element.classList.remove(className);
  },

  toggleClass(id, className) {
    const element = this.getElement(id);
    if (element) element.classList.toggle(className);
  },

  setText(id, text) {
    const element = this.getElement(id);
    if (element) element.textContent = text;
  },

  setValue(id, value) {
    const element = this.getElement(id);
    if (element) element.value = value;
  },

  setPlaceholder(id, placeholder) {
    const element = this.getElement(id);
    if (element) element.placeholder = placeholder;
  },

  setDisabled(id, disabled) {
    const element = this.getElement(id);
    if (element) element.disabled = disabled;
  },

  setOpacity(id, opacity) {
    const element = this.getElement(id);
    if (element) element.style.opacity = opacity;
  },

  setBackgroundColor(id, color) {
    const element = this.getElement(id);
    if (element) element.style.backgroundColor = color;
  }
};

// Error Handling Utility
export const ErrorHandler = {
  handle(err, context = '') {
    const errorType = this.categorizeError(err);
    this.logError(errorType, err, context);
    this.takeAction(errorType, err);
    return errorType;
  },

  categorizeError(err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      return 'NETWORK_ERROR';
    } else if (err.status === 500) {
      return 'SERVER_ERROR';
    } else if (err.status === 401) {
      return 'AUTH_ERROR';
    } else if (err.status === 429) {
      return 'RATE_LIMIT_ERROR';
    }
    return 'UNKNOWN_ERROR';
  },

  logError(type, err, context) {
    const messages = {
      'NETWORK_ERROR': 'İnternet bağlantı hatası',
      'SERVER_ERROR': 'Sunucu hatası',
      'AUTH_ERROR': 'Yetkilendirme hatası',
      'RATE_LIMIT_ERROR': 'Rate limit hatası',
      'UNKNOWN_ERROR': 'Beklenmeyen hata'
    };
    
    const contextInfo = context ? ` (${context})` : '';
    console.error(`${messages[type]}${contextInfo}:`, err);
  },

  takeAction(type, err) {
    switch (type) {
      case 'AUTH_ERROR':
        localStorage.clear();
        window.location.replace('/');
        break;
      case 'NETWORK_ERROR':
        // Could show user-friendly message
        break;
      default:
        // No specific action needed
        break;
    }
  }
};

// Validation Utility
export const ValidationUtils = {
  isValidEmail(email) {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pattern.test(email);
  },

  isValidCode(code) {
    return /^\d{6}$/.test(code);
  },

  isEmpty(value) {
    return !value || value.trim() === '';
  }
};

// Storage Utility
export const StorageUtils = {
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error('LocalStorage set error:', error);
    }
  },

  get(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error('LocalStorage get error:', error);
      return null;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('LocalStorage remove error:', error);
    }
  },

  clear() {
    try {
      localStorage.clear();
    } catch (error) {
      console.error('LocalStorage clear error:', error);
    }
  }
};
