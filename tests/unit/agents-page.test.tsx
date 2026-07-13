import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Agents } from '../../src/pages/Agents/index';

const channelsAccountsMock = vi.fn();
const subscribeHostEventMock = vi.fn();
const fetchAgentsMock = vi.fn();
const createAgentMock = vi.fn();
const updateAgentMock = vi.fn();
const updateAgentModelMock = vi.fn();
const refreshProviderSnapshotMock = vi.fn();

const { gatewayState, agentsState, providersState } = vi.hoisted(() => ({
  gatewayState: {
    status: { state: 'running', port: 18789 },
  },
  agentsState: {
    agents: [] as Array<Record<string, unknown>>,
    defaultModelRef: null as string | null,
    loading: false,
    error: null as string | null,
  },
  providersState: {
    accounts: [] as Array<Record<string, unknown>>,
    statuses: [] as Array<Record<string, unknown>>,
    vendors: [] as Array<Record<string, unknown>>,
    defaultAccountId: '' as string,
  },
}));

vi.mock('@/stores/gateway', () => ({
  useGatewayStore: (selector: (state: typeof gatewayState) => unknown) => selector(gatewayState),
}));

vi.mock('@/stores/agents', () => ({
  useAgentsStore: (selector?: (state: typeof agentsState & {
    fetchAgents: typeof fetchAgentsMock;
    updateAgent: typeof updateAgentMock;
    updateAgentModel: typeof updateAgentModelMock;
    createAgent: typeof createAgentMock;
    deleteAgent: ReturnType<typeof vi.fn>;
  }) => unknown) => {
    const state = {
      ...agentsState,
      fetchAgents: fetchAgentsMock,
      updateAgent: updateAgentMock,
      updateAgentModel: updateAgentModelMock,
      createAgent: createAgentMock,
      deleteAgent: vi.fn(),
    };
    return typeof selector === 'function' ? selector(state) : state;
  },
}));

vi.mock('@/stores/providers', () => ({
  useProviderStore: (selector: (state: typeof providersState & {
    refreshProviderSnapshot: typeof refreshProviderSnapshotMock;
  }) => unknown) => {
    const state = {
      ...providersState,
      refreshProviderSnapshot: refreshProviderSnapshotMock,
    };
    return selector(state);
  },
}));

vi.mock('@/lib/host-api', () => ({
  hostApi: {
    channels: {
      accounts: (...args: unknown[]) => channelsAccountsMock(...args),
    },
  },
}));

vi.mock('@/lib/host-events', () => ({
  hostEvents: {
    onGatewayChannelStatus: (handler: unknown) => subscribeHostEventMock('gateway:channel-status', handler),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

function renderAgents() {
  return render(<Agents />, { wrapper: MemoryRouter });
}

describe('Agents page status refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gatewayState.status = { state: 'running', port: 18789 };
    agentsState.agents = [];
    agentsState.defaultModelRef = null;
    providersState.accounts = [];
    providersState.statuses = [];
    providersState.vendors = [];
    providersState.defaultAccountId = '';
    fetchAgentsMock.mockResolvedValue(undefined);
    createAgentMock.mockResolvedValue(undefined);
    updateAgentMock.mockResolvedValue(undefined);
    updateAgentModelMock.mockResolvedValue(undefined);
    refreshProviderSnapshotMock.mockResolvedValue(undefined);
    channelsAccountsMock.mockResolvedValue({
      success: true,
      channels: [],
    });
  });

  it('refetches channel accounts when gateway channel-status events arrive', async () => {
    let channelStatusHandler: (() => void) | undefined;
    subscribeHostEventMock.mockImplementation((eventName: string, handler: () => void) => {
      if (eventName === 'gateway:channel-status') {
        channelStatusHandler = handler;
      }
      return vi.fn();
    });

    renderAgents();

    await waitFor(() => {
      expect(fetchAgentsMock).toHaveBeenCalledTimes(1);
      expect(channelsAccountsMock).toHaveBeenCalledWith();
    });
    expect(subscribeHostEventMock).toHaveBeenCalledWith('gateway:channel-status', expect.any(Function));

    await act(async () => {
      channelStatusHandler?.();
    });

    await waitFor(() => {
      expect(channelsAccountsMock).toHaveBeenCalledTimes(2);
    });
  });

  it('refetches channel accounts when the gateway transitions to running after mount', async () => {
    gatewayState.status = { state: 'starting', port: 18789 };

    const { rerender } = renderAgents();

    await waitFor(() => {
      expect(fetchAgentsMock).toHaveBeenCalledTimes(1);
      expect(channelsAccountsMock).toHaveBeenCalledWith();
    });

    gatewayState.status = { state: 'running', port: 18789 };
    await act(async () => {
      rerender(<Agents />);
    });

    await waitFor(() => {
      expect(channelsAccountsMock).toHaveBeenCalledTimes(2);
    });
  });

  it('does not render the legacy gateway warning during transient stopped status', async () => {
    gatewayState.status = { state: 'stopped', port: 18789 };

    renderAgents();

    await waitFor(() => {
      expect(fetchAgentsMock).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByText('gatewayWarning')).not.toBeInTheDocument();
  });

  it('updates an agent through the built-in canvasland model plan dropdown', async () => {
    agentsState.agents = [
      {
        id: 'main',
        name: 'Main',
        isDefault: true,
        modelDisplay: 'GPT 5.4',
        modelRef: 'canvasland-newapi/gpt-5.4',
        overrideModelRef: 'canvasland-newapi/gpt-5.4',
        modelPlanId: 'gpt-5.4',
        inheritedModel: false,
        workspace: '~/.openclaw/workspace',
        agentDir: '~/.openclaw/agents/main/agent',
        mainSessionKey: 'agent:main:desk',
        channelTypes: [],
      },
    ];
    agentsState.defaultModelRef = 'canvasland-newapi/gpt-5.4';

    renderAgents();

    await waitFor(() => {
      expect(fetchAgentsMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTitle('settings'));
    fireEvent.click(screen.getByText('settingsDialog.modelLabel').closest('button') as HTMLButtonElement);

    const modelSelect = await screen.findByTestId('agent-model-plan-update-select');
    const saveButton = screen.getByRole('button', { name: 'common:actions.save' });

    expect(modelSelect).toHaveTextContent('GPT 5.4');
    expect(modelSelect).toHaveTextContent('GPT 5.5');
    expect(modelSelect).toHaveTextContent('Qwen 3.6 Plus');
    expect(modelSelect).toHaveTextContent('Qwen 3.7 Max');
    expect(saveButton).toBeDisabled();

    fireEvent.change(modelSelect, { target: { value: 'qwen3.7-max' } });
    expect(saveButton).toBeEnabled();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateAgentModelMock).toHaveBeenCalledWith('main', 'canvasland-newapi/qwen3.7-max', 'qwen3.7-max');
    });
  });

  it('keeps built-in model selection available when no provider account exists', async () => {
    agentsState.agents = [
      {
        id: 'main',
        name: 'Main',
        isDefault: true,
        modelDisplay: 'gpt-5.4',
        modelRef: 'canvasland-newapi/gpt-5.4',
        overrideModelRef: null,
        modelPlanId: 'gpt-5.4',
        inheritedModel: true,
        workspace: '~/.openclaw/workspace',
        agentDir: '~/.openclaw/agents/main/agent',
        mainSessionKey: 'agent:main:main',
        channelTypes: [],
      },
    ];
    agentsState.defaultModelRef = null;
    providersState.accounts = [];
    providersState.statuses = [];

    renderAgents();

    await waitFor(() => {
      expect(fetchAgentsMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTitle('settings'));
    fireEvent.click(screen.getByText('settingsDialog.modelLabel').closest('button') as HTMLButtonElement);

    const modelSelect = await screen.findByTestId('agent-model-plan-update-select');
    expect(modelSelect).toHaveTextContent('GPT 5.4');
    expect(modelSelect).toHaveTextContent('Qwen 3.7 Max');
    expect(screen.queryByText('settingsDialog.modelProviderEmpty')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'settingsDialog.addProviderAction' })).not.toBeInTheDocument();
  });

  it('creates an agent with a built-in model plan and persona without provider fields', async () => {
    renderAgents();

    await waitFor(() => {
      expect(fetchAgentsMock).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTestId('agents-add-button'));

    const nameInput = await screen.findByLabelText('createDialog.nameLabel');
    const modelSelect = screen.getByTestId('agent-model-plan-select');
    const personaTextarea = screen.getByTestId('agent-persona-textarea');

    expect(modelSelect).toHaveTextContent('GPT 5.4');
    expect(modelSelect).toHaveTextContent('GPT 5.5');
    expect(modelSelect).toHaveTextContent('Qwen 3.6 Plus');
    expect(modelSelect).toHaveTextContent('Qwen 3.7 Max');
    expect(screen.queryByText('settingsDialog.modelProviderLabel')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/API Key/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Base URL/i)).not.toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: 'Store Writer' } });
    fireEvent.change(modelSelect, { target: { value: 'gpt-5.5' } });
    fireEvent.change(personaTextarea, { target: { value: 'Write concise ecommerce copy.' } });
    fireEvent.click(screen.getByRole('button', { name: 'common:actions.save' }));

    await waitFor(() => {
      expect(createAgentMock).toHaveBeenCalledWith('Store Writer', {
        inheritWorkspace: false,
        modelPlanId: 'gpt-5.5',
        persona: 'Write concise ecommerce copy.',
      });
    });
  });

  it('keeps the last agent snapshot visible while a refresh is in flight', async () => {
    agentsState.agents = [
      {
        id: 'main',
        name: 'Main',
        isDefault: true,
        modelDisplay: 'gpt-5',
        modelRef: 'openai/gpt-5',
        overrideModelRef: null,
        inheritedModel: true,
        workspace: '~/.openclaw/workspace',
        agentDir: '~/.openclaw/agents/main/agent',
        mainSessionKey: 'agent:main:main',
        channelTypes: [],
      },
    ];

    const { rerender } = renderAgents();

    expect(await screen.findByText('Main')).toBeInTheDocument();

    agentsState.loading = true;
    await act(async () => {
      rerender(<Agents />);
    });

    expect(screen.getByText('Main')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps the blocking spinner during the initial load before any stable snapshot exists', async () => {
    agentsState.loading = true;
    fetchAgentsMock.mockImplementation(() => new Promise(() => {}));
    refreshProviderSnapshotMock.mockImplementation(() => new Promise(() => {}));
    channelsAccountsMock.mockImplementation(() => new Promise(() => {}));

    const { container } = renderAgents();

    expect(container.querySelector('svg.animate-spin')).toBeTruthy();
    expect(screen.queryByText('title')).not.toBeInTheDocument();
  });
});
