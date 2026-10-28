import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FluentProvider, webLightTheme } from '@fluentui/react-components'

import { scenariosApi } from '@/services/api'
import type { ScenarioHierarchyNode, ScenarioHierarchyProjection, ScenarioProgressCounts } from '@/types'

import ScenarioResultHierarchy from './ScenarioResultHierarchy'

jest.mock('@/services/api', () => ({
  scenariosApi: { getRunHierarchy: jest.fn(), getRunHierarchyNode: jest.fn() },
}))

const getRoots = scenariosApi.getRunHierarchy as jest.Mock
const getNode = scenariosApi.getRunHierarchyNode as jest.Mock

const TOTALS: ScenarioProgressCounts = {
  completed: 7,
  planned: 9,
  succeeded: 2,
  success_percentage: 29,
  errors: 1,
  retries: 4,
}

function node(id: string, overrides: Partial<ScenarioHierarchyNode> = {}): ScenarioHierarchyNode {
  return {
    attack_result_id: id,
    conversation_id: `conv-${id}`,
    result_role: 'target_facing',
    atomic_attack_name: `attack ${id}`,
    atomic_group_id: 'g1',
    seed_group_id: 's1',
    objective: `objective ${id}`,
    outcome: 'failure',
    execution_time_ms: 1000,
    executed_turns: 1,
    timestamp: '2026-10-28T00:00:00Z',
    total_retries: 0,
    retries: [],
    retries_truncated: false,
    child_attack_result_ids: [],
    child_references_truncated: false,
    children: [],
    children_truncated: false,
    child_offset: 0,
    unresolved_child_attack_result_ids: [],
    unresolved_child_references_truncated: false,
    conversations: [],
    conversations_truncated: false,
    ...overrides,
  }
}

function projection(roots: ScenarioHierarchyNode[], overrides: Partial<ScenarioHierarchyProjection> = {}) {
  return {
    scenario_result_id: 'run',
    scenario_name: 'scenario',
    scenario_version: 1,
    status: 'COMPLETED',
    groups: [
      {
        atomic_group_id: 'g1',
        atomic_attack_name: 'sequential',
        display_group: 'Sequential',
        roots,
        counts: TOTALS,
      },
    ],
    overall_counts: TOTALS,
    diagnostics: {
      failed_attacks: [],
      failed_attacks_count: 0,
      failed_attacks_truncated: false,
      attack_retries: [],
      attack_retries_count: 0,
      attack_retries_truncated: false,
      total_retries: 4,
      rootless_result_ids: [],
      rootless_results_count: 0,
      rootless_results_truncated: false,
    },
    truncated: false,
    has_more: false,
    next_cursor: null,
    ...overrides,
  } satisfies ScenarioHierarchyProjection
}

function cursorError(status: number) {
  return { isAxiosError: true, response: { status, data: { detail: 'Cursor does not match' } }, message: 'x' }
}

/** An orchestration parent whose children the preview deferred. */
const PARENT = node('parent', {
  result_role: 'orchestration',
  child_attack_result_ids: ['c1', 'missing'],
  children_truncated: true,
  children_count: 3,
})

function mount(onOpenResult = jest.fn()) {
  render(
    <FluentProvider theme={webLightTheme}>
      <ScenarioResultHierarchy scenarioResultId="run" onOpenResult={onOpenResult} />
    </FluentProvider>,
  )
  return onOpenResult
}

const totalsText = () => screen.getByLabelText('Run totals').textContent

beforeEach(() => {
  getRoots.mockReset()
  getNode.mockReset()
})

test('loads children by position, keeps unresolved references visible, and pages with the node cursor', async () => {
  const user = userEvent.setup()
  getRoots.mockResolvedValue(projection([PARENT]))
  getNode
    .mockResolvedValueOnce(
      node('parent', {
        result_role: 'orchestration',
        child_attack_result_ids: ['c1', 'missing'],
        children: [node('c1', { child_index: 0, parent_attack_result_id: 'parent' })],
        children_count: 3,
        next_children_cursor: 'children-2',
      }),
    )
    .mockResolvedValueOnce(
      node('parent', {
        result_role: 'orchestration',
        child_offset: 2,
        child_attack_result_ids: ['c3'],
        children: [node('c3', { child_index: 2, parent_attack_result_id: 'parent' })],
        children_count: 3,
      }),
    )
  mount()

  await user.click(await screen.findByRole('button', { name: 'Expand children of attack parent: objective parent' }))
  const children = await screen.findByRole('list', { name: 'Children of attack parent: objective parent' })

  expect(getNode).toHaveBeenLastCalledWith('run', 'parent', { limit: 200 }, expect.any(AbortSignal))
  expect(within(children).getByText('objective c1')).toBeInTheDocument()
  expect(within(children).getByText('Unresolved reference: missing')).toBeInTheDocument()
  expect(within(children).getByText('#2')).toBeInTheDocument()
  expect(screen.getByText('Showing 2 of 3 saved children')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Load more children' }))

  expect(await within(children).findByText('objective c3')).toBeInTheDocument()
  expect(getNode).toHaveBeenLastCalledWith(
    'run',
    'parent',
    { limit: 200, children_cursor: 'children-2' },
    expect.any(AbortSignal),
  )
  expect(within(children).getByText('#3')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Load more children' })).not.toBeInTheDocument()
  expect(getRoots).toHaveBeenCalledTimes(1)
})

test('run totals come from the backend and do not change as roots and children load', async () => {
  const user = userEvent.setup()
  getRoots
    .mockResolvedValueOnce(projection([PARENT], { has_more: true, next_cursor: 'roots-2' }))
    .mockResolvedValueOnce(projection([node('second-root')]))
  getNode.mockResolvedValue(
    node('parent', {
      result_role: 'orchestration',
      child_attack_result_ids: ['c1'],
      children: [node('c1', { child_index: 0 })],
      children_count: 1,
    }),
  )
  mount()

  await screen.findByLabelText('Run totals')
  const before = totalsText()
  expect(before).toContain('Completed: 7 of 9')

  await user.click(screen.getByRole('button', { name: 'Load more results' }))
  await screen.findByText('objective second-root')
  expect(getRoots).toHaveBeenLastCalledWith('run', { max_nodes: 1000, cursor: 'roots-2' }, expect.any(AbortSignal))

  await user.click(screen.getByRole('button', { name: 'Expand children of attack parent: objective parent' }))
  await screen.findByText('objective c1')

  expect(totalsText()).toBe(before)
})

test('expanding a node whose preview is complete makes no request', async () => {
  const user = userEvent.setup()
  getRoots.mockResolvedValue(
    projection([
      node('parent', {
        result_role: 'orchestration',
        child_attack_result_ids: ['c1'],
        children: [node('c1', { child_index: 0 })],
        children_count: 1,
      }),
    ]),
  )
  mount()

  await user.click(await screen.findByRole('button', { name: 'Expand children of attack parent: objective parent' }))

  expect(screen.getByText('objective c1')).toBeInTheDocument()
  expect(getNode).not.toHaveBeenCalled()
})

test('a stale child cursor asks to reload the children and restarts paging from the first page', async () => {
  const user = userEvent.setup()
  getRoots.mockResolvedValue(projection([PARENT]))
  getNode
    .mockResolvedValueOnce(
      node('parent', {
        child_attack_result_ids: ['c1'],
        children: [node('c1', { child_index: 0 })],
        children_count: 3,
        next_children_cursor: 'children-2',
      }),
    )
    .mockRejectedValueOnce(cursorError(400))
    .mockResolvedValueOnce(
      node('parent', {
        child_attack_result_ids: ['c9'],
        children: [node('c9', { child_index: 0 })],
        children_count: 1,
      }),
    )
  mount()

  await user.click(await screen.findByRole('button', { name: 'Expand children of attack parent: objective parent' }))
  await user.click(await screen.findByRole('button', { name: 'Load more children' }))

  expect(await screen.findByText("This result's saved children changed since they were loaded.")).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Load more children' })).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Reload children' }))

  expect(await screen.findByText('objective c9')).toBeInTheDocument()
  expect(screen.queryByText('objective c1')).not.toBeInTheDocument()
  expect(getNode).toHaveBeenLastCalledWith('run', 'parent', { limit: 200 }, expect.any(AbortSignal))
})

test('a stale root cursor asks to reload the hierarchy', async () => {
  const user = userEvent.setup()
  getRoots
    .mockResolvedValueOnce(projection([node('r1')], { has_more: true, next_cursor: 'roots-2' }))
    .mockRejectedValueOnce(cursorError(400))
    .mockResolvedValueOnce(projection([node('fresh')]))
  mount()

  await user.click(await screen.findByRole('button', { name: 'Load more results' }))
  expect(await screen.findByText("This run's saved results changed since they were loaded.")).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Reload hierarchy' }))

  expect(await screen.findByText('objective fresh')).toBeInTheDocument()
  expect(getRoots).toHaveBeenLastCalledWith('run', { max_nodes: 1000 }, expect.any(AbortSignal))
})

test('a failed first load can be retried', async () => {
  const user = userEvent.setup()
  getRoots.mockRejectedValueOnce(cursorError(500)).mockResolvedValueOnce(projection([node('r1')]))
  mount()

  await user.click(await screen.findByRole('button', { name: 'Retry' }))

  expect(await screen.findByText('objective r1')).toBeInTheDocument()
})

test('shows empty, truncated and rootless states without inventing roots', async () => {
  getRoots.mockResolvedValue({
    ...projection([], { truncated: true }),
    groups: [],
    diagnostics: { ...projection([]).diagnostics, rootless_result_ids: ['x', 'y'], rootless_results_count: 2 },
  })
  mount()

  expect(await screen.findByText(/2 saved results have no root in this run/)).toHaveTextContent('Their IDs: x, y.')
  expect(screen.getByText(/Some results are not in this preview/)).toBeInTheDocument()
  expect(screen.queryByText('No saved results are available for this run yet.')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Expand/ })).not.toBeInTheDocument()
})

test('opens details for a node with the clicked button as the focus target', async () => {
  const user = userEvent.setup()
  getRoots.mockResolvedValue(projection([node('r1')]))
  const onOpenResult = mount()

  const button = await screen.findByRole('button', { name: 'Open details for attack r1: objective r1' })
  await user.click(button)

  expect(onOpenResult).toHaveBeenCalledWith(expect.objectContaining({ attack_result_id: 'r1' }), button)
})

test('an empty run says so', async () => {
  getRoots.mockResolvedValue({ ...projection([]), groups: [] })
  mount()

  expect(await screen.findByText('No saved results are available for this run yet.')).toBeInTheDocument()
})

test('shows the totals the backend reports, not totals counted from loaded rows', async () => {
  const user = userEvent.setup()
  getRoots
    .mockResolvedValueOnce(projection([node('r1')], { has_more: true, next_cursor: 'roots-2' }))
    .mockResolvedValueOnce(projection([node('r2')], { overall_counts: { ...TOTALS, completed: 8 } }))
  mount()

  await user.click(await screen.findByRole('button', { name: 'Load more results' }))
  await screen.findByText('objective r2')

  expect(totalsText()).toContain('Completed: 8 of 9')
})

test('reloading after expanding starts from a collapsed tree with no stale children', async () => {
  const user = userEvent.setup()
  getRoots
    .mockResolvedValueOnce(projection([PARENT], { has_more: true, next_cursor: 'roots-2' }))
    .mockRejectedValueOnce(cursorError(400))
    .mockResolvedValueOnce(projection([PARENT]))
  getNode.mockResolvedValue(
    node('parent', { child_attack_result_ids: ['c1'], children: [node('c1', { child_index: 0 })], children_count: 1 }),
  )
  mount()

  await user.click(await screen.findByRole('button', { name: 'Expand children of attack parent: objective parent' }))
  await screen.findByText('objective c1')
  await user.click(screen.getByRole('button', { name: 'Load more results' }))
  await user.click(await screen.findByRole('button', { name: 'Reload hierarchy' }))

  const expand = await screen.findByRole('button', { name: 'Expand children of attack parent: objective parent' })
  expect(expand).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText('objective c1')).not.toBeInTheDocument()

  await user.click(expand)
  expect(await screen.findByText('objective c1')).toBeInTheDocument()
  expect(getNode).toHaveBeenCalledTimes(2)
})

test('notes that a run still in progress is a snapshot and can be reloaded', async () => {
  const user = userEvent.setup()
  getRoots
    .mockResolvedValueOnce(projection([node('r1')], { status: 'IN_PROGRESS' }))
    .mockResolvedValueOnce(projection([node('r1'), node('r2')], { status: 'COMPLETED' }))
  mount()

  expect(await screen.findByText(/This run is still in progress/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Reload hierarchy' }))

  expect(await screen.findByText('objective r2')).toBeInTheDocument()
  expect(screen.queryByText(/This run is still in progress/)).not.toBeInTheDocument()
})
