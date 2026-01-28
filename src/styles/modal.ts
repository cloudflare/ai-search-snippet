/**
 * Modal search combobox specific styles
 */

export const modalStyles = `
/* Modal backdrop */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  z-index: var(--search-snippet-z-modal);
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--search-snippet-transition), visibility var(--search-snippet-transition);
}

.modal-backdrop.open {
  opacity: 1;
  visibility: visible;
}

/* Modal container */
.modal-container {
  position: fixed;
  top: 15%;
  left: 50%;
  transform: translateX(-50%) scale(0.95);
  width: 90%;
  max-width: 600px;
  max-height: 70vh;
  background: var(--search-snippet-background);
  border: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
  border-radius: var(--search-snippet-border-radius);
  box-shadow: var(--search-snippet-shadow-lg);
  z-index: calc(var(--search-snippet-z-modal) + 1);
  display: flex;
  flex-direction: column;
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--search-snippet-transition), 
              visibility var(--search-snippet-transition),
              transform var(--search-snippet-transition);
}

.modal-container.open {
  opacity: 1;
  visibility: visible;
  transform: translateX(-50%) scale(1);
}

/* Modal header with search input */
.modal-header {
  display: flex;
  align-items: center;
  gap: var(--search-snippet-spacing-sm);
  padding: var(--search-snippet-spacing-md);
  border-bottom: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
}

.modal-search-icon {
  width: var(--search-snippet-icon-size);
  height: var(--search-snippet-icon-size);
  color: var(--search-snippet-text-secondary);
  flex-shrink: 0;
}

.modal-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--search-snippet-text-color);
  font-size: var(--search-snippet-font-size-lg);
  font-family: var(--search-snippet-font-family);
  font-weight: var(--search-snippet-font-weight-normal);
  padding: var(--search-snippet-spacing-xs) 0;
}

.modal-search-input::placeholder {
  color: var(--search-snippet-text-secondary);
}

.modal-shortcut-hint {
  display: flex;
  align-items: center;
  gap: var(--search-snippet-spacing-xs);
  color: var(--search-snippet-text-secondary);
  font-size: var(--search-snippet-font-size-sm);
  flex-shrink: 0;
}

.modal-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 22px;
  padding: 0 var(--search-snippet-spacing-xs);
  background: var(--search-snippet-surface);
  border: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
  border-radius: 4px;
  font-size: var(--search-snippet-font-size-sm);
  font-family: var(--search-snippet-font-family);
  color: var(--search-snippet-text-secondary);
}

/* Modal content (results area) */
.modal-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--search-snippet-spacing-sm);
}

.modal-content::-webkit-scrollbar {
  width: 8px;
}

.modal-content::-webkit-scrollbar-track {
  background: var(--search-snippet-surface);
}

.modal-content::-webkit-scrollbar-thumb {
  background: var(--search-snippet-border-color);
  border-radius: var(--search-snippet-border-radius);
}

.modal-content::-webkit-scrollbar-thumb:hover {
  background: var(--search-snippet-text-secondary);
}

/* Results list */
.modal-results {
  display: flex;
  flex-direction: column;
  gap: var(--search-snippet-spacing-xs);
}

a.modal-result-item {
  padding: var(--search-snippet-spacing-md);
  background: transparent;
  border: var(--search-snippet-border-width) solid transparent;
  border-radius: calc(var(--search-snippet-border-radius) - 4px);
  cursor: pointer;
  transition: var(--search-snippet-transition-fast);
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: var(--search-snippet-spacing-md);
  text-decoration: none;
  color: inherit;
}

/* Image thumbnail container */
.modal-result-image-container {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--search-snippet-surface);
  border: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
  position: relative;
}

.modal-result-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity var(--search-snippet-transition);
}

.modal-result-image.loaded {
  opacity: 1;
}

/* Loading shimmer */
.modal-result-image-loading {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    var(--search-snippet-surface) 25%,
    var(--search-snippet-border-color) 50%,
    var(--search-snippet-surface) 75%
  );
  background-size: 200% 100%;
  animation: modal-image-shimmer 1.5s infinite;
}

@keyframes modal-image-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Placeholder icon */
.modal-result-image-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--search-snippet-text-secondary);
  opacity: 0.5;
}

.modal-result-image-placeholder svg {
  width: 20px;
  height: 20px;
}

/* Content wrapper */
.modal-result-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--search-snippet-spacing-xs);
}

a.modal-result-item:hover,
a.modal-result-item.active {
  background: var(--search-snippet-hover-background);
  border-color: var(--search-snippet-border-color);
}

a.modal-result-item.active {
  border-color: var(--search-snippet-primary-color);
  background: var(--search-snippet-focus-ring);
}

a.modal-result-item:focus-visible {
  outline: 2px solid var(--search-snippet-primary-color);
  outline-offset: -2px;
}

.modal-result-title {
  font-size: var(--search-snippet-font-size-base);
  font-weight: var(--search-snippet-font-weight-medium);
  color: var(--search-snippet-text-color);
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.modal-result-description {
  font-size: var(--search-snippet-font-size-sm);
  color: var(--search-snippet-text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.modal-result-url {
  font-size: var(--search-snippet-font-size-sm);
  color: var(--search-snippet-primary-color);
  text-decoration: none;
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-result-url:hover {
  text-decoration: underline;
}

/* Result group header */
.modal-group-header {
  padding: var(--search-snippet-spacing-sm) var(--search-snippet-spacing-md);
  font-size: var(--search-snippet-font-size-sm);
  font-weight: var(--search-snippet-font-weight-medium);
  color: var(--search-snippet-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Loading state */
.modal-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--search-snippet-spacing-xxl);
  gap: var(--search-snippet-spacing-md);
  color: var(--search-snippet-text-secondary);
}

/* Empty state */
.modal-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--search-snippet-spacing-xxl);
  gap: var(--search-snippet-spacing-md);
  color: var(--search-snippet-text-secondary);
  text-align: center;
}

.modal-empty-icon {
  width: 48px;
  height: 48px;
  opacity: 0.5;
}

.modal-empty-title {
  font-size: var(--search-snippet-font-size-base);
  font-weight: var(--search-snippet-font-weight-medium);
  color: var(--search-snippet-text-color);
}

.modal-empty-description {
  font-size: var(--search-snippet-font-size-sm);
}

/* Footer */
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--search-snippet-spacing-sm) var(--search-snippet-spacing-md);
  border-top: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
  background: var(--search-snippet-surface);
  font-size: var(--search-snippet-font-size-sm);
  color: var(--search-snippet-text-secondary);
  border-radius: 0 0 var(--search-snippet-border-radius) var(--search-snippet-border-radius);
}

.modal-footer-hints {
  display: flex;
  align-items: center;
  gap: var(--search-snippet-spacing-md);
}

.modal-footer-hint {
  display: flex;
  align-items: center;
  gap: var(--search-snippet-spacing-xs);
}

.modal-footer-hint .modal-kbd {
  min-width: 20px;
  height: 20px;
  font-size: 11px;
}

/* Results count */
.modal-results-count {
  font-size: var(--search-snippet-font-size-sm);
  color: var(--search-snippet-text-secondary);
}

/* Powered by in modal footer */
.modal-footer .powered-by-inline {
  font-size: var(--search-snippet-font-size-sm);
  color: var(--search-snippet-text-secondary);
}

.modal-footer .powered-by-inline a {
  color: var(--search-snippet-text-secondary);
  text-decoration: none;
  transition: color var(--search-snippet-transition-fast);
}

.modal-footer .powered-by-inline a:hover {
  color: var(--search-snippet-primary-color);
}

/* Responsive adjustments */
@media (max-width: 640px) {
  .modal-container {
    top: 10%;
    width: 95%;
    max-height: 80vh;
  }

  .modal-footer-hints {
    display: none;
  }
}

/* Animation for modal open */
@keyframes modal-slide-in {
  from {
    opacity: 0;
    transform: translateX(-50%) scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) scale(1) translateY(0);
  }
}

.modal-container.open {
  animation: modal-slide-in var(--search-snippet-transition) ease-out;
}
`;
