const CLEARABLE_SEARCH_SELECTOR = "input[data-clearable-search]";
const SEARCH_CLEAR_ROOT_SELECTOR = "[data-search-clear-root], .search-clear-control";
const SEARCH_CLEAR_BUTTON_SELECTOR = "[data-search-clear-button]";
const SEARCH_CLEAR_EMPTY_ONLY_SELECTOR = "[data-search-clear-when-empty]";

let searchClearObserver = null;
let searchClearEventsBound = false;

function isClearableSearchInput(node) {
  return node instanceof HTMLInputElement && node.matches(CLEARABLE_SEARCH_SELECTOR);
}

function createSearchClearButton() {
  const button = document.createElement("button");
  button.className = "search-clear-button";
  button.type = "button";
  button.hidden = true;
  button.dataset.searchClearButton = "";
  button.setAttribute("aria-label", "Aramayı temizle");
  button.setAttribute("title", "Aramayı temizle");
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
  return button;
}

function getSearchClearRoot(input) {
  const existingRoot = input.closest("[data-search-clear-root]");
  if (existingRoot) return existingRoot;

  const control = document.createElement("span");
  control.className = "search-clear-control";
  input.before(control);
  control.append(input);
  return control;
}

function getSearchInputForButton(button) {
  const root = button.closest(SEARCH_CLEAR_ROOT_SELECTOR);
  return root?.querySelector(CLEARABLE_SEARCH_SELECTOR) || null;
}

export function syncSearchClearControl(input) {
  if (!isClearableSearchInput(input)) return;
  const root = input.closest(SEARCH_CLEAR_ROOT_SELECTOR);
  if (!root) return;

  const hasValue = input.value.length > 0;
  const button = root.querySelector(SEARCH_CLEAR_BUTTON_SELECTOR);
  if (button) button.hidden = !hasValue;
  root.classList.toggle("has-search-value", hasValue);
  root.querySelectorAll(SEARCH_CLEAR_EMPTY_ONLY_SELECTOR).forEach((element) => {
    element.hidden = hasValue;
  });
}

export function clearSearchInput(input) {
  if (!isClearableSearchInput(input)) return false;

  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  syncSearchClearControl(input);
  if (!input.disabled && input.isConnected) input.focus({ preventScroll: true });
  return true;
}

export function enhanceSearchClearControl(input) {
  if (!isClearableSearchInput(input) || input.dataset.searchClearReady === "true") return;
  input.dataset.searchClearReady = "true";

  const root = getSearchClearRoot(input);
  let button = root.querySelector(SEARCH_CLEAR_BUTTON_SELECTOR);
  if (!button) {
    button = createSearchClearButton();
    root.append(button);
  }
  syncSearchClearControl(input);
}

export function enhanceSearchClearControls(root = document) {
  if (isClearableSearchInput(root)) enhanceSearchClearControl(root);
  root.querySelectorAll?.(CLEARABLE_SEARCH_SELECTOR).forEach(enhanceSearchClearControl);
}

function bindSearchClearEvents() {
  if (searchClearEventsBound) return;
  searchClearEventsBound = true;

  document.addEventListener("input", (event) => {
    if (isClearableSearchInput(event.target)) syncSearchClearControl(event.target);
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest?.(SEARCH_CLEAR_BUTTON_SELECTOR);
    if (button) {
      const input = getSearchInputForButton(button);
      if (input) clearSearchInput(input);
      return;
    }

    const root = event.target.closest?.("[data-search-clear-root]");
    if (!root || event.target.closest?.("input, a, button, select, textarea")) return;
    const input = root.querySelector(CLEARABLE_SEARCH_SELECTOR);
    if (input && !input.disabled) input.focus({ preventScroll: true });
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key !== "Escape"
      || event.isComposing
      || !isClearableSearchInput(event.target)
      || event.target.value.length === 0
    ) return;

    event.preventDefault();
    event.stopPropagation();
    clearSearchInput(event.target);
  }, true);
}

export function initSearchClearControls(root = document) {
  bindSearchClearEvents();
  enhanceSearchClearControls(root);

  if (!searchClearObserver && document.body) {
    searchClearObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) enhanceSearchClearControls(node);
        });
      });
    });
    searchClearObserver.observe(document.body, { childList: true, subtree: true });
  }
}
