import * as React from 'react';

import { Button, Tabs as StorybookTabs } from 'storybook/internal/components';

import { CollapseIcon, ExpandAltIcon, EyeCloseIcon, EyeIcon, SyncIcon } from '@storybook/icons';

import type { Result } from 'axe-core';
import { styled, useTheme } from 'storybook/theming';

import type { RuleType } from '../types';
import { useA11yContext } from './A11yContext';

const Container = styled.div({
  width: '100%',
  position: 'relative',
  height: '100%',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
});

const ActionsWrapper = styled.div({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 6,
});

interface TabsProps {
  tabs: {
    label: React.ReactElement;
    panel: React.ReactElement;
    items: Result[];
    type: RuleType;
  }[];
}

const TabPanel: React.FC<{
  id: string;
  title: React.ReactNode;
  children: React.ReactNode;
}> = ({ id, children }) => <div id={id}>{children}</div>;

export const Tabs: React.FC<TabsProps> = ({ tabs }) => {
  const {
    tab,
    setTab,
    toggleHighlight,
    highlighted,
    handleManual,
    allExpanded,
    handleCollapseAll,
    handleExpandAll,
  } = useA11yContext();

  const theme = useTheme();

  return (
    <Container>
      <StorybookTabs
        backgroundColor={theme.background.app}
        selected={tab}
        actions={{ onSelect: (id: string) => setTab(id as RuleType) }}
        tools={
          <ActionsWrapper>
            <Button
              variant="ghost"
              padding="small"
              onClick={toggleHighlight}
              ariaLabel={
                highlighted
                  ? 'Hide accessibility test result highlights'
                  : 'Highlight elements with accessibility test results'
              }
            >
              {highlighted ? <EyeCloseIcon /> : <EyeIcon />}
            </Button>
            <Button
              variant="ghost"
              padding="small"
              onClick={allExpanded ? handleCollapseAll : handleExpandAll}
              ariaLabel={allExpanded ? 'Collapse all results' : 'Expand all results'}
              aria-expanded={allExpanded}
            >
              {allExpanded ? <CollapseIcon /> : <ExpandAltIcon />}
            </Button>
            <Button
              variant="ghost"
              padding="small"
              onClick={handleManual}
              ariaLabel="Rerun accessibility scan"
            >
              <SyncIcon />
            </Button>
          </ActionsWrapper>
        }
      >
        {tabs.map((tabItem) => (
          <TabPanel key={tabItem.type} id={tabItem.type} title={tabItem.label}>
            {tabItem.panel}
          </TabPanel>
        ))}
      </StorybookTabs>
    </Container>
  );
};
