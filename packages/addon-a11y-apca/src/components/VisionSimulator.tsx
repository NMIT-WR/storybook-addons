import React from 'react';

import { Button } from 'storybook/internal/components';

import { AccessibilityIcon } from '@storybook/icons';

import { useGlobals } from 'storybook/manager-api';
import { styled } from 'storybook/theming';

import { VISION_GLOBAL_KEY } from '../constants';
import { filterDefs, filters } from '../visionSimulatorFilters';

const Hidden = styled.div({
  '&, & svg': {
    position: 'absolute',
    width: 0,
    height: 0,
  },
});

const ColorIcon = styled.span<{ $filter: string }>(
  {
    background: 'linear-gradient(to right, #F44336, #FF9800, #FFEB3B, #8BC34A, #2196F3, #9C27B0)',
    borderRadius: 14,
    display: 'block',
    flexShrink: 0,
    height: 14,
    width: 14,
  },
  ({ $filter }) => ({
    filter: filters[$filter as keyof typeof filters].filter || 'none',
  }),
  ({ theme }) => ({
    boxShadow: `${theme.appBorderColor} 0 0 0 1px inset`,
  })
);

const SelectRow = styled.div(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: theme.appBorderRadius,
  background: theme.background.content,
}));

const SelectInput = styled.select(({ theme }) => ({
  flex: 1,
  minWidth: 0,
  padding: '4px 6px',
  border: `1px solid ${theme.appBorderColor}`,
  borderRadius: theme.appBorderRadius,
  background: theme.background.app,
  color: theme.color.defaultText,
  fontSize: theme.typography.size.s2,
}));

const ResetButton = styled(Button)({
  whiteSpace: 'nowrap',
});

export const VisionSimulator = () => {
  const [globals, updateGlobals] = useGlobals();
  const value = globals[VISION_GLOBAL_KEY];

  const options = Object.entries(filters).map(([key, { label, percentage }]) => ({
    label: percentage ? `${label} (${percentage}% of users)` : label,
    value: key,
  }));

  return (
    <>
      <SelectRow aria-label="Vision simulator">
        <AccessibilityIcon />
        <ColorIcon $filter={String(value || 'none')} />
        <SelectInput
          value={value ?? ''}
          onChange={(event) =>
            updateGlobals({ [VISION_GLOBAL_KEY]: event.target.value || undefined })
          }
        >
          <option value="">No filter</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectInput>
        <ResetButton
          variant="ghost"
          padding="small"
          onClick={() => updateGlobals({ [VISION_GLOBAL_KEY]: undefined })}
          ariaLabel="Reset color filter"
        >
          Reset
        </ResetButton>
      </SelectRow>
      <Hidden dangerouslySetInnerHTML={{ __html: filterDefs }} />
    </>
  );
};
