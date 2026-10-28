import { makeStyles, tokens } from '@fluentui/react-components'

import { NARROW_VIEWPORT_QUERY, mobileTouchTarget } from '@/styles/touchTargets'

export const useScenarioResultHierarchyStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    minWidth: 0,
  },
  totals: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalL,
  },
  hint: {
    color: tokens.colorNeutralForeground3,
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    paddingTop: tokens.spacingVerticalS,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  tree: {
    listStyleType: 'none',
    margin: 0,
    paddingLeft: 0,
  },
  subtree: {
    listStyleType: 'none',
    margin: 0,
    paddingLeft: tokens.spacingHorizontalXXL,
    borderLeft: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    [NARROW_VIEWPORT_QUERY]: {
      paddingLeft: tokens.spacingHorizontalM,
    },
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalXXS,
    paddingBottom: tokens.spacingVerticalXXS,
    minWidth: 0,
  },
  expandButton: {
    ...mobileTouchTarget,
  },
  expandSpacer: {
    width: '2rem',
    flexShrink: 0,
    ...mobileTouchTarget,
  },
  position: {
    color: tokens.colorNeutralForeground3,
    fontVariantNumeric: 'tabular-nums',
  },
  objective: {
    minWidth: 0,
    flexBasis: '16rem',
    flexGrow: 1,
    overflowWrap: 'anywhere',
  },
  unresolved: {
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic',
    overflowWrap: 'anywhere',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalXS,
  },
  touchTarget: {
    ...mobileTouchTarget,
  },
})
