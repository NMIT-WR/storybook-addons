# @techsio/storybook-better-a11y

Storybook Accessibility addon with APCA (WCAG 3) contrast checks, tuned for RsBuild/RsLib.

## Install
```bash
pnpm add -D @techsio/storybook-better-a11y
```

## Usage
```ts
// .storybook/main.ts
export default {
  addons: ['@techsio/storybook-better-a11y'],
};
```

```ts
// .storybook/preview.ts
export default {
  parameters: {
    a11y: {
      options: {
        runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice', 'wcag2aaa'],
      },
      apca: {
        level: 'silver',
        useCase: 'body',
        iconSelectors: ['[class^="token-icon-"]', '[class*=" token-icon-"]'],
      },
      test: 'error',
    },
  },
};
```

## APCA parameters
- `level`: `bronze | silver | gold`
- `useCase`: `body | fluent | sub-fluent | non-fluent`
- `iconSelectors`: CSS selectors to include additional icon elements (e.g. `.token-icon-error`, `[class^="token-icon-"]`)

You can override the use case per element using `data-apca-usecase`.
