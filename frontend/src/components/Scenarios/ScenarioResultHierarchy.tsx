import {
  Badge,
  Button,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Text,
} from '@fluentui/react-components'
import { ChevronDownRegular, ChevronRightRegular } from '@fluentui/react-icons'

import OutcomeBadge from '@/components/OutcomeBadge'
import { formatAttackSuccess, formatDuration } from '@/components/AttackResults/attackAttemptFormatting'
import {
  useScenarioResultHierarchy,
  type HierarchyChildrenState,
  type UseScenarioResultHierarchyResult,
} from '@/hooks/useScenarioResultHierarchy'
import type { ScenarioHierarchyNode, ScenarioProgressCounts, ScenarioRunState } from '@/types'

import { childSlots, hasChildReferences, resultRoleLabel } from './scenarioHierarchy'
import { useScenarioResultHierarchyStyles } from './ScenarioResultHierarchy.styles'

interface ScenarioResultHierarchyProps {
  readonly scenarioResultId: string
  readonly onOpenResult: (node: ScenarioHierarchyNode, trigger: HTMLElement) => void
}

/** Read-only browser for a run's saved result lineage: orchestration parents and their ordered children. */
export default function ScenarioResultHierarchy({ scenarioResultId, onOpenResult }: ScenarioResultHierarchyProps) {
  const styles = useScenarioResultHierarchyStyles()
  const hierarchy = useScenarioResultHierarchy(scenarioResultId)
  const { roots, expanded, toggleNode: toggle } = hierarchy

  // Plain status text, not a Spinner: a progressbar role here would be read as run progress.
  if (roots.status === 'loading') {
    return (
      <Text role="status" className={styles.hint}>
        Loading result hierarchy...
      </Text>
    )
  }

  if (roots.status === 'error') {
    return (
      <MessageBar intent="error">
        <MessageBarBody>Could not load the result hierarchy: {roots.error}</MessageBarBody>
        <MessageBarActions>
          <Button className={styles.touchTarget} onClick={hierarchy.reloadRoots}>Retry</Button>
        </MessageBarActions>
      </MessageBar>
    )
  }

  const rootless = roots.diagnostics?.rootless_results_count ?? 0
  const rootlessSample = roots.diagnostics?.rootless_result_ids ?? []
  const runActive = roots.runStatus !== null && ACTIVE_RUN_STATES.has(roots.runStatus)

  return (
    <div className={styles.root}>
      {roots.overallCounts && <RunTotals counts={roots.overallCounts} />}
      <Text size={200} className={styles.hint}>
        Totals cover the whole run as reported by the server; they are not counted from the rows shown here.
      </Text>
      {runActive && (
        <div className={styles.footer}>
          <Text size={200} className={styles.hint}>
            This run is still in progress, so this hierarchy shows the results saved when it loaded.
          </Text>
          <Button size="small" className={styles.touchTarget} onClick={hierarchy.reloadRoots}>
            Reload hierarchy
          </Button>
        </div>
      )}

      {roots.groups.length === 0 ? (
        rootless === 0 && <Text>No saved results are available for this run yet.</Text>
      ) : (
        roots.groups.map((group) => (
          <section key={group.atomic_group_id} className={styles.group} aria-label={`${group.display_group} results`}>
            <Text weight="semibold">{group.display_group}</Text>
            <Text size={200} className={styles.hint}>
              {group.atomic_attack_name} · {formatCounts(group.counts)}
            </Text>
            <ul className={styles.tree}>
              {group.roots.map((node, i) => {
                const key = `${group.atomic_group_id}:${i}:${node.attack_result_id}`
                return (
                  <HierarchyNodeItem
                    key={key}
                    nodeKey={key}
                    node={node}
                    position={null}
                    expanded={expanded}
                    hierarchy={hierarchy}
                    onToggle={toggle}
                    onOpenResult={onOpenResult}
                  />
                )
              })}
            </ul>
          </section>
        ))
      )}

      {roots.truncated && (
        <Text size={200} className={styles.hint}>
          Some results are not in this preview, such as deeper levels or results it could not place. Expand a
          result to load its saved children.
        </Text>
      )}
      {rootless > 0 && (
        <Text size={200} className={styles.hint}>
          {rootless} saved {rootless === 1 ? 'result has' : 'results have'} no root in this run (for example, a
          cycle of references) and {rootless === 1 ? 'is' : 'are'} not shown in the tree.
          {rootlessSample.length > 0 &&
            ` ${roots.diagnostics?.rootless_results_truncated ? 'Some of their IDs' : 'Their IDs'}: ${rootlessSample.join(', ')}.`}
        </Text>
      )}

      {roots.staleCursor ? (
        <MessageBar intent="warning">
          <MessageBarBody>This run's saved results changed since they were loaded.</MessageBarBody>
          <MessageBarActions>
            <Button className={styles.touchTarget} onClick={hierarchy.reloadRoots}>Reload hierarchy</Button>
          </MessageBarActions>
        </MessageBar>
      ) : roots.error ? (
        <MessageBar intent="error">
          <MessageBarBody>Could not load more results: {roots.error}</MessageBarBody>
          <MessageBarActions>
            <Button className={styles.touchTarget} onClick={hierarchy.loadMoreRoots}>Retry</Button>
          </MessageBarActions>
        </MessageBar>
      ) : null}
      {roots.nextCursor && !roots.staleCursor && !roots.error && (
        <div className={styles.footer}>
          <Button className={styles.touchTarget} disabled={roots.loadingMore} onClick={hierarchy.loadMoreRoots}>
            {roots.loadingMore ? 'Loading...' : 'Load more results'}
          </Button>
        </div>
      )}
    </div>
  )
}

interface HierarchyNodeItemProps {
  readonly nodeKey: string
  readonly node: ScenarioHierarchyNode
  /** Absolute position under the parent, or null for a root. */
  readonly position: number | null
  readonly expanded: ReadonlySet<string>
  readonly hierarchy: UseScenarioResultHierarchyResult
  readonly onToggle: (key: string, node: ScenarioHierarchyNode) => void
  readonly onOpenResult: (node: ScenarioHierarchyNode, trigger: HTMLElement) => void
}

function HierarchyNodeItem({
  nodeKey,
  node,
  position,
  expanded,
  hierarchy,
  onToggle,
  onOpenResult,
}: HierarchyNodeItemProps) {
  const styles = useScenarioResultHierarchyStyles()
  const isExpanded = expanded.has(nodeKey)
  const expandable = hasChildReferences(node)
  const panelId = `hierarchy-${nodeKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  const label = nodeLabel(node, position)

  return (
    <li>
      <div className={styles.row}>
        {expandable ? (
          <Button
            appearance="subtle"
            size="small"
            className={styles.expandButton}
            icon={isExpanded ? <ChevronDownRegular /> : <ChevronRightRegular />}
            aria-expanded={isExpanded}
            aria-controls={isExpanded ? panelId : undefined}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} children of ${label}`}
            onClick={() => onToggle(nodeKey, node)}
          />
        ) : (
          <span className={styles.expandSpacer} />
        )}
        {position !== null && <Text className={styles.position}>#{position + 1}</Text>}
        <Badge appearance="outline" color={node.result_role === 'unknown' ? 'subtle' : 'brand'}>
          {resultRoleLabel(node.result_role)}
        </Badge>
        <OutcomeBadge appearance="tint" outcome={node.outcome} label={formatAttackSuccess(node.outcome)} />
        <Text className={styles.objective}>{node.objective}</Text>
        <Text size={200} className={styles.hint}>
          {node.outcome === 'error'
            ? node.error_message ?? node.error_type ?? 'Error'
            : `${formatDuration(node.execution_time_ms)} · ${node.total_retries} retries`}
        </Text>
        <Button
          size="small"
          className={styles.touchTarget}
          aria-label={`Open details for ${label}`}
          onClick={(event) => onOpenResult(node, event.currentTarget)}
        >
          Details
        </Button>
      </div>
      {expandable && isExpanded && (
        <ChildList
          panelId={panelId}
          parentKey={nodeKey}
          parent={node}
          state={hierarchy.children.get(nodeKey)}
          expanded={expanded}
          hierarchy={hierarchy}
          onToggle={onToggle}
          onOpenResult={onOpenResult}
        />
      )}
    </li>
  )
}

interface ChildListProps {
  readonly panelId: string
  readonly parentKey: string
  readonly parent: ScenarioHierarchyNode
  readonly state: HierarchyChildrenState | undefined
  readonly expanded: ReadonlySet<string>
  readonly hierarchy: UseScenarioResultHierarchyResult
  readonly onToggle: (key: string, node: ScenarioHierarchyNode) => void
  readonly onOpenResult: (node: ScenarioHierarchyNode, trigger: HTMLElement) => void
}

function ChildList({
  panelId,
  parentKey,
  parent,
  state,
  expanded,
  hierarchy,
  onToggle,
  onOpenResult,
}: ChildListProps) {
  const styles = useScenarioResultHierarchyStyles()
  const pages = state?.pages ?? []
  const slots = pages.flatMap(childSlots)
  const loaded = slots.length
  const total = state?.childrenCount ?? null

  return (
    <div id={panelId}>
      <ul className={styles.subtree} aria-label={`Children of ${nodeLabel(parent, null)}`}>
        {slots.map((slot) =>
          slot.kind === 'child' ? (
            <HierarchyNodeItem
              key={`${slot.position}:${slot.node.attack_result_id}`}
              nodeKey={`${parentKey}/${slot.position}:${slot.node.attack_result_id}`}
              node={slot.node}
              position={slot.position}
              expanded={expanded}
              hierarchy={hierarchy}
              onToggle={onToggle}
              onOpenResult={onOpenResult}
            />
          ) : (
            <li key={`${slot.position}:${slot.attackResultId}`}>
              <div className={styles.row}>
                <span className={styles.expandSpacer} />
                <Text className={styles.position}>#{slot.position + 1}</Text>
                <Text className={styles.unresolved}>Unresolved reference: {slot.attackResultId}</Text>
              </div>
            </li>
          ),
        )}
      </ul>
      <div className={styles.footer}>
        {state?.loading && (
          <Text role="status" size={200} className={styles.hint}>
            Loading children...
          </Text>
        )}
        {!state?.loading && pages.length > 0 && (
          <Text size={200} className={styles.hint}>
            {total !== null ? `Showing ${loaded} of ${total} saved children` : `Showing ${loaded} saved children`}
          </Text>
        )}
        {state?.staleCursor ? (
          <MessageBar intent="warning">
            <MessageBarBody>This result's saved children changed since they were loaded.</MessageBarBody>
            <MessageBarActions>
              <Button className={styles.touchTarget} onClick={() => hierarchy.restartChildren(parentKey, parent)}>
                Reload children
              </Button>
            </MessageBarActions>
          </MessageBar>
        ) : state?.error ? (
          <MessageBar intent="error">
            <MessageBarBody>Could not load children: {state.error}</MessageBarBody>
            <MessageBarActions>
              <Button
                className={styles.touchTarget}
                onClick={() =>
                  pages.length > 0
                    ? hierarchy.loadMoreChildren(parentKey, parent)
                    : hierarchy.restartChildren(parentKey, parent)
                }
              >
                Retry
              </Button>
            </MessageBarActions>
          </MessageBar>
        ) : null}
        {state?.nextCursor && !state.loading && !state.staleCursor && !state.error && (
          <Button className={styles.touchTarget} onClick={() => hierarchy.loadMoreChildren(parentKey, parent)}>
            Load more children
          </Button>
        )}
      </div>
    </div>
  )
}

function RunTotals({ counts }: { readonly counts: ScenarioProgressCounts }) {
  const styles = useScenarioResultHierarchyStyles()
  return (
    <div className={styles.totals} aria-label="Run totals">
      <Text>Completed: {counts.planned !== null ? `${counts.completed} of ${counts.planned}` : counts.completed}</Text>
      <Text>Succeeded: {counts.succeeded}</Text>
      <Text>Errors: {counts.errors}</Text>
      <Text>Retries: {counts.retries}</Text>
    </div>
  )
}

const ACTIVE_RUN_STATES: ReadonlySet<ScenarioRunState> = new Set(['CREATED', 'QUEUED', 'IN_PROGRESS'])
const LABEL_OBJECTIVE_LENGTH = 60

/** Accessible name for a result; sibling results usually share an attack name, so add position and objective. */
function nodeLabel(node: ScenarioHierarchyNode, position: number | null): string {
  const objective =
    node.objective.length > LABEL_OBJECTIVE_LENGTH
      ? `${node.objective.slice(0, LABEL_OBJECTIVE_LENGTH)}...`
      : node.objective
  const prefix = position === null ? '' : `#${position + 1} `
  return `${prefix}${node.atomic_attack_name}: ${objective}`
}

function formatCounts(counts: ScenarioProgressCounts): string {
  const completed = counts.planned !== null ? `${counts.completed} of ${counts.planned}` : `${counts.completed}`
  return `${completed} completed, ${counts.succeeded} succeeded, ${counts.errors} errors, ${counts.retries} retries`
}
