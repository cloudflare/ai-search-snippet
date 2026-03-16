/**
 * Search mode specific styles
 */

export const searchStyles = `
/* Search view states */
.search-view {
  transition: var(--search-snippet-transition-slow);
  background: var(--search-snippet-background);
  border-radius: var(--search-snippet-border-radius);
  padding: 0px;
}

.search-view-collapsed {
  max-height: 60px;
}

.search-view-expanded {
  max-height: var(--search-snippet-max-height);
}


.search-icon {
  width: var(--search-snippet-icon-size);
  height: var(--search-snippet-icon-size);
  margin-left: var(--search-snippet-icon-margin-left);
  color: var(--search-snippet-text-color);
}

/* Search input wrapper */
.search-input-wrapper {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--search-snippet-spacing-sm);
  overflow: hidden;
  transition: max-width var(--search-snippet-transition-slow), 
              opacity var(--search-snippet-transition);
  padding: var(--search-snippet-spacing-sm);
  border-radius: var(--search-snippet-border-radius);
  border: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
}



.search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--search-snippet-text-color);
  font-size: var(--search-snippet-font-size-base);
  font-weight: var(--search-snippet-font-weight-medium);
  box-shadow: none;
  padding: 0;
}

.search-input::placeholder {
  color: var(--search-snippet-text-secondary);
}

.search-view:has(.search-input:not(:placeholder-shown)) .search-input-wrapper, .search-view:has(.search-input:not(:placeholder-shown)) {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.search-view:focus-within {
  border-color: var(--search-snippet-primary-color);
  box-shadow: inset 0 0 0 3px var(--search-snippet-focus-ring);
}

.search-view:has(.search-input:not(:placeholder-shown)) .search-content {
  max-height: 600px;
  opacity: 1;
  overflow-y: auto;
  padding: 8px;
}

.search-submit-button {
  flex-shrink: 0;
  
  border-radius: max(var(--search-snippet-button-min-border-radius, 4px), calc(var(--search-snippet-border-radius) - var(--search-snippet-spacing-sm)))
}

/* Search content */
.search-content {
  max-height: 0;
  opacity: 0;
  transition: max-height var(--search-snippet-transition-slow),
              opacity var(--search-snippet-transition);
  position: absolute;
  width: 100%;
  background: var(--search-snippet-background);
  border-bottom-left-radius: var(--search-snippet-border-radius);
  border-bottom-right-radius: var(--search-snippet-border-radius);
  border: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
  border-top: none;
}

.search-content::-webkit-scrollbar {
  width: 8px;
  height: 100px;
}

.search-content::-webkit-scrollbar-track {
  background: var(--search-snippet-surface);
  
}

.search-content::-webkit-scrollbar-thumb {
  background: var(--search-snippet-border-color);
  border-radius: var(--search-snippet-border-radius);
}

.search-content::-webkit-scrollbar-thumb:hover {
  background: var(--search-snippet-text-secondary);
}

.container {
  overflow: unset;
  position: relative;
  border: none;
}

.container:has(.search-input:not(:placeholder-shown)) {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}


/* Override header for search mode */

/* Search results */
.search-results {
  display: flex;
  flex-direction: column;
  gap: var(--search-snippet-spacing-sm);
}

a.search-result-item {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: var(--search-snippet-spacing-md);
  padding: var(--search-snippet-spacing-md);
  background: var(--search-snippet-surface);
  border: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
  border-radius: var(--search-snippet-border-radius);
  cursor: pointer;
  transition: var(--search-snippet-transition);
  text-decoration: none;
  color: inherit;
}

/* Image thumbnail container */
.search-result-image-container {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border-radius: calc(var(--search-snippet-border-radius) - 4px);
  overflow: hidden;
  position: relative;
}

.search-result-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0;
  transition: opacity var(--search-snippet-transition);
}

.search-result-image.loaded {
  opacity: 1;
}

/* Loading shimmer */
.search-result-image-loading {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    var(--search-snippet-surface) 25%,
    var(--search-snippet-border-color) 50%,
    var(--search-snippet-surface) 75%
  );
  background-size: 200% 100%;
  animation: search-image-shimmer 1.5s infinite;
}

@keyframes search-image-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Placeholder icon */
.search-result-image-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--search-snippet-text-secondary);
  opacity: 0.5;
}

.search-result-image-placeholder svg {
  width: 24px;
  height: 24px;
}

/* Content wrapper */
.search-result-content {
  flex: 1;
  min-width: 0;
}

a.search-result-item:hover {
  background: var(--search-snippet-hover-background);
  border-color: var(--search-snippet-primary-color);
  transform: translateY(-1px);
  box-shadow: var(--search-snippet-result-item-shadow);
}

a.search-result-item:focus-visible {
  outline: 2px solid var(--search-snippet-primary-color);
  outline-offset: 2px;
}

.search-result-title {
  font-size: var(--search-snippet-font-size-base);
  font-weight: var(--search-snippet-font-weight-medium);
  color: var(--search-snippet-text-color);
  margin-bottom: var(--search-snippet-spacing-xs);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.search-result-snippet {
  font-size: var(--search-snippet-font-size-sm);
  color: var(--search-snippet-text-description);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.search-result-url {
  font-size: var(--search-snippet-font-size-sm);
  color: var(--search-snippet-primary-color);
  margin-top: var(--search-snippet-spacing-xs);
  text-decoration: none;
  display: inline-block;
}

.search-result-url:hover {
  text-decoration: underline;
}

/* Search header */
.search-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--search-snippet-spacing-md);
  padding-bottom: var(--search-snippet-spacing-sm);
  border-bottom: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
}

.search-count {
  font-size: var(--search-snippet-font-size-sm);
  color: var(--search-snippet-text-secondary);
}

/* Search footer */
.search-footer {
  padding: var(--search-snippet-spacing-md);
  border-top: var(--search-snippet-border-width) solid var(--search-snippet-border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--search-snippet-spacing-sm);
}

/* Loading state for search */
.search-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--search-snippet-spacing-xxl);
  gap: var(--search-snippet-spacing-md);
  color: var(--search-snippet-text-secondary);
}

/* Empty search state */
.search-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--search-snippet-spacing-xxl);
  gap: var(--search-snippet-spacing-md);
  color: var(--search-snippet-text-secondary);
  text-align: center;
}

.search-empty-icon {
  width: 64px;
  height: 64px;
  opacity: 0.5;
}

.search-empty-title {
  font-size: var(--search-snippet-font-size-lg);
  font-weight: var(--search-snippet-font-weight-medium);
  color: var(--search-snippet-text-color);
}

.search-empty-description {
  font-size: var(--search-snippet-font-size-sm);
}

/* Highlight matching text */
.search-highlight {
  background: var(--search-snippet-warning-background);
  color: var(--search-snippet-warning-color);
  padding: 1px 2px;
  border-radius: 2px;
  font-weight: var(--search-snippet-font-weight-medium);
}
`;
