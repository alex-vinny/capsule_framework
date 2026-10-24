---
title: "Hello World"
audience: app-developer
status: current
---
# Hello World Example

Here is the minimal code you need to display “Hello, World!” in a Capsule app.

## src/App.tsx

```tsx
import { CapsuleText } from '@capsule/core';

export default function App() {
  return (
    <CapsuleText center>
      Hello, World!
    </CapsuleText>
  );
}
```

## Running the example

1. Follow the [quick start](quickstart.md) steps to create a new app.
2. Replace the generated `src/App.tsx` with the code above.
3. Run `pnpm dev` and `pnpm dev:android` (or `pnpm dev:ios` when iOS support is ready).
4. You should see a centered “Hello, World!” text on the screen.

Feel free to experiment with other components from `@capsule/core` such as `CapsuleButton`, `CapsuleImage`, etc.