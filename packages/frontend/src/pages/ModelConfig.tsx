import { Meta, Title } from '@solidjs/meta';
import { useParams } from '@solidjs/router';
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  lazy,
  Show,
  Suspense,
  type Component,
} from 'solid-js';
import ErrorState from '../components/ErrorState.jsx';
import { agentDisplayName } from '../services/agent-display-name.js';
import {
  getProviders,
  getAvailableModels,
  type AvailableModel,
  type RoutingProvider,
  type AuthType,
} from '../services/api/routing.js';
import {
  getModelParamSpecs,
  listModelParams,
  setModelParams as setModelParamsApi,
  type AgentModelParamsRow,
} from '../services/api/model-params.js';
import type { RequestParamDefaults } from '../services/api.js';
import { PROVIDERS } from '../services/providers.js';
import { providerIcon } from '../components/ProviderIcon.js';
import '../styles/model-config.css';

const ModelParamsDialog = lazy(() => import('../components/ModelParamsDialog.jsx'));

/** Auth type badge label */
const AUTH_LABEL: Record<string, string> = {
  api_key: 'API key',
  subscription: 'Subscription',
  local: 'Local',
};

interface ConfigureSignal {
  providerName: string;
  provider: string;
  authType: AuthType;
  model: string;
  slotLabel: string;
}

const ModelConfig: Component = () => {
  const params = useParams<{ agentName: string }>();
  const agentName = () => params.agentName;

  const [configure, setConfigure] = createSignal<ConfigureSignal | null>(null);

  // Fetch connected providers
  const [providers] = createResource(
    () => agentName(),
    (name) => getProviders(name).catch(() => [] as RoutingProvider[]),
  );

  // Fetch available models for this agent
  const [availableModels] = createResource(
    () => agentName(),
    (name) => getAvailableModels(name).catch(() => [] as AvailableModel[]),
  );

  // Fetch saved model params
  const [modelParams, { mutate: mutateModelParams }] = createResource(
    () => agentName(),
    (name) => listModelParams(name).catch(() => [] as AgentModelParamsRow[]),
  );

  const modelParamsMap = createMemo(() => {
    const map = new Map<string, RequestParamDefaults>();
    const rows = modelParams();
    if (!rows) return map;
    for (const row of rows) {
      const key = `${row.provider}:${row.authType}:${row.model}`;
      map.set(key, row.params);
    }
    return map;
  });

  // Active providers (connected)
  const activeProviders = createMemo(() => providers()?.filter((p) => p.is_active) ?? []);

  // Group models by provider
  const modelsByProvider = createMemo(() => {
    const models = availableModels();
    const provs = providers() ?? [];
    if (!models || models.length === 0) return new Map<string, AvailableModel[]>();

    const active = new Set(provs.filter((p) => p.is_active).map((p) => p.provider.toLowerCase()));

    const map = new Map<string, AvailableModel[]>();
    for (const m of models) {
      const key = m.provider.toLowerCase();
      if (!active.has(key)) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    // Sort providers by display name
    return new Map(
      [...map.entries()].sort((a, b) => {
        const pa = provs.find((p) => p.provider.toLowerCase() === a[0]);
        const pb = provs.find((p) => p.provider.toLowerCase() === b[0]);
        return (pa?.provider ?? a[0]).localeCompare(pb?.provider ?? b[0]);
      }),
    );
  });

  const providerDisplayName = (providerId: string) => {
    const prov = providers()?.find((p) => p.provider.toLowerCase() === providerId.toLowerCase());
    if (prov) return prov.provider;
    const def = PROVIDERS.find((d) => d.id === providerId.toLowerCase());
    return def?.name ?? providerId;
  };

  const providerIconEl = (providerId: string) => providerIcon(providerId, 24);

  const getParams = (
    provider: string,
    authType: AuthType,
    model: string,
  ): RequestParamDefaults | null =>
    modelParamsMap().get(`${provider.toLowerCase()}:${authType}:${model}`) ?? null;

  const setParams = async (
    provider: string,
    authType: AuthType,
    model: string,
    next: RequestParamDefaults | null,
  ) => {
    if (!next || Object.keys(next).length === 0) {
      // Delete
      await setModelParamsApi(agentName(), {
        scope: 'tier:default',
        provider,
        authType,
        model,
        params: {},
      });
    } else {
      await setModelParamsApi(agentName(), {
        scope: 'tier:default',
        provider,
        authType,
        model,
        params: next,
      });
    }
    // Refetch
    const fresh = await listModelParams(agentName()).catch(() => [] as AgentModelParamsRow[]);
    mutateModelParams(fresh);
  };

  const isConfigured = (provider: string, authType: AuthType, model: string) =>
    getParams(provider, authType, model) !== null;

  const formatPrice = (price: number | null): string => {
    if (price === null || price === undefined) return '—';
    if (price === 0) return 'Free';
    const perMill = price * 1_000_000;
    if (perMill < 0.01) return `$${perMill.toFixed(4)}/M`;
    if (perMill < 1) return `$${perMill.toFixed(2)}/M`;
    return `$${perMill.toFixed(1)}/M`;
  };

  const capabilityBadge = (m: AvailableModel): string | null => {
    if (m.capability_reasoning) return 'Reasoning';
    if (m.capability_code) return 'Code';
    return null;
  };

  return (
    <div class="container--lg">
      <Title>Model Configuration - Manifest</Title>
      <Meta
        name="description"
        content="Configure per-model parameters for your connected providers."
      />

      <div class="page-header">
        <div>
          <h1>Model Configuration</h1>
          <span class="breadcrumb">
            Fine-tune parameters for each model on {agentDisplayName() ?? 'your agent'}
          </span>
        </div>
      </div>

      <Show when={providers.loading || availableModels.loading}>
        <div class="loading-state">Loading providers and models…</div>
      </Show>

      <Show when={providers.error || availableModels.error}>
        <ErrorState message="Failed to load provider data. Check your connection and try again." />
      </Show>

      <Show when={!providers.loading && !availableModels.loading && activeProviders().length === 0}>
        <div class="empty-state">
          <h3>No providers connected</h3>
          <p>
            Connect a provider from the{' '}
            <a href={`/agents/${encodeURIComponent(agentName())}/routing`}>Routing page</a> to
            configure model parameters.
          </p>
        </div>
      </Show>

      <Show when={!providers.loading && !availableModels.loading && activeProviders().length > 0}>
        <For each={[...modelsByProvider().entries()]}>
          {([providerId, models]) => (
            <div class="model-config-provider">
              <div class="model-config-provider__header">
                <span class="model-config-provider__icon">{providerIconEl(providerId)}</span>
                <h2>{providerDisplayName(providerId)}</h2>
              </div>

              <div class="model-config-grid">
                <For each={models}>
                  {(model) => {
                    const authType = model.auth_type ?? 'api_key';
                    const badge = capabilityBadge(model);
                    const configured = isConfigured(model.provider, authType, model.model_name);

                    return (
                      <div
                        class="model-config-card"
                        classList={{ 'model-config-card--configured': configured }}
                      >
                        <div class="model-config-card__header">
                          <span class="model-config-card__name">
                            {model.display_name ?? model.model_name}
                          </span>
                          <span class="badge badge--auth">{AUTH_LABEL[authType] ?? authType}</span>
                          {badge && <span class="badge badge--capability">{badge}</span>}
                        </div>

                        <div class="model-config-card__info">
                          <span class="model-config-card__price">
                            {formatPrice(model.input_price_per_token)} in /{' '}
                            {formatPrice(model.output_price_per_token)} out
                          </span>
                          <span class="model-config-card__context">
                            {model.context_window >= 1_000_000
                              ? `${(model.context_window / 1_000_000).toFixed(1)}M`
                              : model.context_window >= 1_000
                                ? `${Math.round(model.context_window / 1_000)}K`
                                : model.context_window}{' '}
                            context
                          </span>
                        </div>

                        <button
                          type="button"
                          class="btn btn--sm"
                          classList={{
                            'btn--primary': !configured,
                            'btn--outline': configured,
                          }}
                          onClick={() =>
                            setConfigure({
                              providerName: providerDisplayName(providerId),
                              provider: model.provider,
                              authType,
                              model: model.model_name,
                              slotLabel: model.display_name ?? model.model_name,
                            })
                          }
                        >
                          {configured ? 'Edit Parameters' : 'Configure'}
                        </button>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          )}
        </For>
      </Show>

      {/* Model params dialog */}
      <Show when={configure()}>
        {(() => {
          const c = configure()!;
          const [specs] = createResource(
            () => c,
            (key) =>
              getModelParamSpecs(agentName(), key.provider, key.authType, key.model).catch(
                () => [],
              ),
          );

          return (
            <Suspense fallback={null}>
              <ModelParamsDialog
                open={true}
                slotLabel={c.slotLabel}
                current={getParams(c.provider, c.authType, c.model)}
                specs={specs() ?? []}
                loading={specs.loading}
                onSave={async (next) => {
                  await setParams(c.provider, c.authType, c.model, next);
                  setConfigure(null);
                }}
                onClose={() => setConfigure(null)}
              />
            </Suspense>
          );
        })()}
      </Show>
    </div>
  );
};

export default ModelConfig;
