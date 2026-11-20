import type { KeyboardEvent } from "react";

export function navigateRecipeTabs(event: KeyboardEvent<HTMLDivElement>) {
  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:enabled'),
  );
  const index = tabs.indexOf(event.target as HTMLButtonElement);
  if (index === -1) return;

  let next: number;
  switch (event.key) {
    case "ArrowRight":
      next = (index + 1) % tabs.length;
      break;
    case "ArrowLeft":
      next = (index - 1 + tabs.length) % tabs.length;
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = tabs.length - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  tabs[next].focus();
  tabs[next].click();
}
