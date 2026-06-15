import { Meta, Title } from '@solidjs/meta';
import { useLocation, useNavigate, useParams } from '@solidjs/router';
import { createEffect, createResource, createSignal, ErrorBoundary, For, Show, type Component } from 'solid-js';
import CopyButton from '../components/CopyButton.jsx';
import ErrorState from '../components/ErrorState.jsx';
import AgentTypeGrid from '../components/AgentTypeGrid.jsx';
import SetupStepAddProvider from '../components/SetupStepAddProvider.jsx';
import SetupModal from '../components/SetupModal.jsx';
import SettingsAutofixSection from './SettingsAutofixSection.jsx';
import { agentDisplayName } from '../services/agent-display-name.js';
import {
  deleteAgent,
  getAgentInfo,
  getAgentKey,
  listAgentKeys,
  createAgentKey,
  deleteAgentKey,
  renameAgentKey,
  renameAgent,
  rotateAgentKey,
  updateAgent,
  type AgentKey,
} from '../services/api.js';
import { markAgentCreated } from '../services/recent-agents.js';
import { toast } from '../services/toast-store.js';
import { setAgentPlatform } from '../services/agent-platform-store.js';
import {
  type AgentCategory,
  type AgentPlatform,
  CATEGORY_LABELS,
  PLATFORM_LABELS,
  PLATFORMS_BY_CATEGORY,
  platformIcon,
} from 'manifest-shared';

const Settings: Component = () => {
  const params = useParams<{ agentName: string }>();
  const navigate = useNavigate();
  const location = useLocation<{ newApiKey?: string }>();
  const agentName = () => decodeURIComponent(params.agentName);

  const [name, setName] = createSignal(agentName());
  const [saving, setSaving] = createSignal(false);
  const [showDeleteModal, setShowDeleteModal] = createSignal(false);
  const [deleteConfirmName, setDeleteConfirmName] = createSignal('');
  const [deleting, setDeleting] = createSignal(false);
  const [rotating, setRotating] = createSignal(false);
  const [rotatedKey, setRotatedKey] = createSignal<string | null>(
    (location.state as { newApiKey?: string } | undefined)?.newApiKey ?? null,
  );
  const [showTypeModal, setShowTypeModal] = createSignal(false);
  const [showSetupModal, setShowSetupModal] = createSignal(false);
  const [modalCategory, setModalCategory] = createSignal<AgentCategory | null>(null);
  const [modalPlatform, setModalPlatform] = createSignal<AgentPlatform | null>(null);
  const [savingType, setSavingType] = createSignal(false);

  const [agentInfo, { refetch: refetchInfo }] = createResource(() => agentName(), getAgentInfo);
  const [apiKeyData, { refetch: refetchKey }] = createResource(() => agentName(), getAgentKey);
  const [keys, { refetch: refetchKeys }] = createResource(() => agentName(), listAgentKeys);

  // Multi-key management state
  const [newKeyLabel, setNewKeyLabel] = createSignal('');
  const [creatingKey, setCreatingKey] = createSignal(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = createSignal<string | null>(null);
  const [revealedKeyId, setRevealedKeyId] = createSignal<string | null>(null);
  const [editingKeyId, setEditingKeyId] = createSignal<string | null>(null);
  const [editingLabel, setEditingLabel] = createSignal('');
  const [deletingKeyId, setDeletingKeyId] = createSignal<string | null>(null);

  const currentCategory = () => (agentInfo()?.agent_category as AgentCategory) ?? null;
  const currentPlatform = () => (agentInfo()?.agent_platform as AgentPlatform) ?? null;

  const openTypeModal = () => {
    setModalCategory(currentCategory());
    setModalPlatform(currentPlatform());
    setShowTypeModal(true);
  };

  const handleSaveType = async () => {
    if (!modalCategory() || !modalPlatform()) return;
    setSavingType(true);
    try {
      await updateAgent(agentName(), {
        agent_category: modalCategory()!,
        agent_platform: modalPlatform()!,
      });
      setAgentPlatform(modalPlatform()!, modalCategory());
      await refetchInfo();
      await refetchKey();
      setShowTypeModal(false);
      setShowSetupModal(true);
    } catch {
      // error toast handled by fetchMutate
    } finally {
      setSavingType(false);
    }
  };

  const [keyRevealed, setKeyRevealed] = createSignal(false);
  const keyData = () => (apiKeyData.error ? undefined : apiKeyData());
  const fullKey = () => rotatedKey() ?? keyData()?.apiKey ?? null;

  const displayedKey = () => {
    const key = fullKey();
    if (!key) return `${keyData()?.keyPrefix ?? '...'}...`;
    return keyRevealed() ? key : `${keyData()?.keyPrefix ?? '...'}...`;
  };

  const baseUrl = () => {
    const host = window.location.hostname;
    if (host === 'app.manifest.build') return 'https://app.manifest.build/v1';
    return `${window.location.origin}/v1`;
  };

  const handleDeleteAgent = async () => {
    if (deleteConfirmName() !== agentName() || deleting()) return;
    setDeleting(true);
    try {
      await deleteAgent(agentName());
      toast.success(`Harness "${agentName()}" deleted`);
      navigate('/harnesses', { replace: true });
    } catch {
      setDeleting(false);
    }
  };

  const nameChanged = () => name().trim() !== agentName() && name().trim() !== '';

  const handleSaveName = async () => {
    if (!nameChanged()) return;
    setSaving(true);
    try {
      const result = await renameAgent(agentName(), name().trim());
      const slug = (result?.name as string) ?? name().trim();
      markAgentCreated(slug);
      window.location.replace(`/harnesses/${encodeURIComponent(slug)}/settings`);
    } catch {
      setName(agentName());
    } finally {
      setSaving(false);
    }
  };

  const handleRotate = async () => {
    setRotating(true);
    try {
      const result = await rotateAgentKey(agentName());
      setRotatedKey(result.apiKey);
      setKeyRevealed(true);
      toast.success('API key rotated successfully');
      refetchKey();
      refetchKeys();
    } catch {
      // error toast handled by fetchMutate
    } finally {
      setRotating(false);
    }
  };

  // Multi-key handlers
  const handleCreateKey = async () => {
    if (creatingKey()) return;
    const label = newKeyLabel().trim() || undefined;
    setCreatingKey(true);
    try {
      const result = await createAgentKey(agentName(), label);
      setNewlyCreatedKey(result.apiKey);
      setNewKeyLabel('');
      toast.success('New API key created');
      refetchKeys();
    } catch {
      // error toast handled by fetchMutate
    } finally {
      setCreatingKey(false);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    try {
      await deleteAgentKey(agentName(), keyId);
      toast.success('API key revoked');
      setDeletingKeyId(null);
      setRevealedKeyId(null);
      refetchKeys();
    } catch {
      // error toast handled by fetchMutate
    }
  };

  const handleRenameKey = async (keyId: string) => {
    const label = editingLabel().trim();
    if (!label) return;
    try {
      await renameAgentKey(agentName(), keyId, label);
      toast.success('Key label updated');
      setEditingKeyId(null);
      refetchKeys();
    } catch {
      // error toast handled by fetchMutate
    }
  };

  const activeKeys = () => keys()?.keys?.filter((k) => k.isActive) ?? [];
  const inactiveKeys = () => keys()?.keys?.filter((k) => !k.isActive) ?? [];

  return (
    <div class="container--sm">
      <Title>{agentDisplayName() ?? agentName()} Settings - Manifest</Title>
      <Meta
        name="description"
        content={`Configure settings for ${agentDisplayName() ?? agentName()}.`}
      />
      <p style="color: hsl(var(--muted-foreground)); font-size: var(--font-size-sm); margin: 0 0 var(--gap-lg);">
        Rename your agent, manage API keys, and view setup instructions
      </p>

      {/* -- Harness Name ------------------------------ */}
      <div class="settings-card">
        <div class="settings-card__row">
          <div class="settings-card__label">
            <span class="settings-card__label-title">Harness name</span>
            <span class="settings-card__label-desc">
              The display name for this harness across the dashboard.
            </span>
          </div>
          <div class="settings-card__control">
            <input
              class="settings-card__input"
              type="text"
              aria-label="Harness name"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
            />
          </div>
        </div>
        <div class="settings-card__footer">
          <button
            class="btn btn--primary btn--sm"
            onClick={handleSaveName}
            disabled={saving() || !nameChanged()}
          >
            {saving() ? (
              <>
                <span class="spinner" />
                <span class="sr-only">Saving...</span>
              </>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>

      {/* -- Harness Type (read-only + change modal) --- */}
      <h2 class="settings-section__title">Harness type</h2>
      <div class="settings-card">
        <div class="settings-card__row">
          <div class="settings-card__label">
            <span
              class="settings-card__label-title"
              style="display: flex; align-items: center; gap: 6px;"
            >
              <Show when={platformIcon(currentPlatform(), currentCategory())}>
                <img
                  src={platformIcon(currentPlatform(), currentCategory())}
                  alt=""
                  width="18"
                  height="18"
                  class="settings-type__icon"
                />
              </Show>
              {currentPlatform()
                ? (PLATFORM_LABELS[currentPlatform()! as keyof typeof PLATFORM_LABELS] ??
                  currentPlatform())
                : 'Not set'}
            </span>
            <span class="settings-card__label-desc">
              {currentCategory()
                ? CATEGORY_LABELS[currentCategory()! as keyof typeof CATEGORY_LABELS]
                : ''}
            </span>
          </div>
          <div class="settings-card__control settings-card__control--end">
            <button class="btn btn--outline btn--sm" onClick={openTypeModal}>
              Change
            </button>
          </div>
        </div>
      </div>

      {/* -- Auto-fix ---------------------------------- */}
      <SettingsAutofixSection agentName={agentName} />

      {/* -- API Key ----------------------------------- */}
      <ErrorBoundary
        fallback={(err, reset) => (
          <ErrorState
            error={err}
            title="Something went wrong"
            message="An error occurred."
            onRetry={reset}
          />
        )}
      >
        <h2 class="settings-section__title">API Keys</h2>
        <div class="settings-card">
          <div class="settings-card__body">
            <span class="settings-card__label-title">Harness API key</span>
            <span class="settings-card__label-desc" style="font-size: 14px;">
              This key authenticates your harness's requests to Manifest. Rotating it generates a
              new key and immediately invalidates the current one.
            </span>

            {/* Create new key */}
            <div style="display: flex; gap: 8px; margin-bottom: var(--gap-md);">
              <input
                class="settings-card__input"
                type="text"
                placeholder="Key label (optional)"
                aria-label="New key label"
                value={newKeyLabel()}
                onInput={(e) => setNewKeyLabel(e.currentTarget.value)}
                style="flex: 1;"
              />
              <button
                class="btn btn--primary btn--sm"
                onClick={handleCreateKey}
                disabled={creatingKey()}
              >
                {creatingKey() ? <span class="spinner" /> : 'Create key'}
              </button>
            </div>

            {/* Show newly created key */}
            <Show when={newlyCreatedKey()}>
              <div style="background: hsl(var(--chart-2) / 0.1); border: 1px solid hsl(var(--chart-2) / 0.3); border-radius: var(--radius); padding: 10px 14px; margin-bottom: var(--gap-md); font-size: var(--font-size-sm);">
                <strong>New key created.</strong> Copy it now — it won't be shown again.
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                  <code style="font-size: 12px; word-break: break-all; flex: 1;">{newlyCreatedKey()}</code>
                  <CopyButton text={newlyCreatedKey()!} />
                </div>
              </div>
            </Show>

            {/* Active keys list */}
            <Show when={!keys.loading} fallback={<div class="skeleton skeleton--rect" style="width: 100%; height: 80px;" />}>
              <Show when={activeKeys().length > 0}>
                <div style="font-size: 12px; font-weight: 600; color: hsl(var(--muted-foreground)); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">
                  Active keys ({activeKeys().length})
                </div>
                <For each={activeKeys()}>
                  {(key) => (
                    <div style="display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid hsl(var(--border));">
                      <div style="flex: 1; min-width: 0;">
                        <Show
                          when={editingKeyId() === key.id}
                          fallback={
                            <div style="display: flex; align-items: center; gap: 6px;">
                              <span style="font-size: 13px; font-weight: 500;">
                                {key.label ?? 'Unnamed key'}
                              </span>
                              <span style="font-size: 11px; color: hsl(var(--muted-foreground));">
                                ({key.keyPrefix}...)
                              </span>
                              <Show when={key.lastUsedAt}>
                                <span style="font-size: 11px; color: hsl(var(--muted-foreground));">
                                  · Last used {new Date(key.lastUsedAt!).toLocaleDateString()}
                                </span>
                              </Show>
                            </div>
                          }
                        >
                          <div style="display: flex; gap: 4px;">
                            <input
                              class="settings-card__input"
                              type="text"
                              value={editingLabel()}
                              onInput={(e) => setEditingLabel(e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameKey(key.id);
                                if (e.key === 'Escape') setEditingKeyId(null);
                              }}
                              style="font-size: 13px; flex: 1;"
                              autoFocus
                            />
                            <button
                              class="btn btn--ghost btn--sm"
                              onClick={() => handleRenameKey(key.id)}
                              title="Save"
                            >✓</button>
                            <button
                              class="btn btn--ghost btn--sm"
                              onClick={() => setEditingKeyId(null)}
                              title="Cancel"
                            >✕</button>
                          </div>
                        </Show>
                      </div>
                      <div style="display: flex; gap: 2px; flex-shrink: 0;">
                        <Show when={editingKeyId() !== key.id}>
                          <button
                            class="btn btn--ghost btn--sm"
                            onClick={() => {
                              setEditingKeyId(key.id);
                              setEditingLabel(key.label ?? '');
                            }}
                            title="Rename"
                          >✎</button>
                          <button
                            class="btn btn--ghost btn--sm"
                            onClick={() => setDeletingKeyId(key.id)}
                            title="Revoke key"
                            style="color: hsl(var(--destructive));"
                          >✕</button>
                        </Show>
                      </div>
                    </div>
                  )}
                </For>
              </Show>

              {/* Inactive (revoked) keys */}
              <Show when={inactiveKeys().length > 0}>
                <div style="font-size: 12px; font-weight: 600; color: hsl(var(--muted-foreground)); margin-top: var(--gap-md); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.05em;">
                  Revoked keys ({inactiveKeys().length})
                </div>
                <For each={inactiveKeys()}>
                  {(key) => (
                    <div style="display: flex; align-items: center; gap: 8px; padding: 6px 0; opacity: 0.5;">
                      <div style="flex: 1; min-width: 0;">
                        <span style="font-size: 13px;">{key.label ?? 'Unnamed key'}</span>
                        <span style="font-size: 11px; color: hsl(var(--muted-foreground));"> ({key.keyPrefix}...)</span>
                      </div>
                      <span style="font-size: 11px; color: hsl(var(--muted-foreground));">Revoked</span>
                    </div>
                  )}
                </For>
              </Show>

              <Show when={activeKeys().length === 0 && inactiveKeys().length === 0}>
                <div style="font-size: 13px; color: hsl(var(--muted-foreground)); padding: 8px 0;">
                  No keys found. Create one above.
                </div>
              </Show>
            </Show>
          </div>
          <div class="settings-card__footer">
            <button class="btn btn--outline btn--sm" onClick={handleRotate} disabled={rotating()}>
              {rotating() ? (
                <>
                  <span class="spinner" />
                  <span class="sr-only">Rotating...</span>
                </>
              ) : (
                'Rotate all keys'
              )}
            </button>
          </div>
        </div>

        {/* Delete key confirmation dialog */}
        <Show when={deletingKeyId()}>
          <div style="background: hsl(var(--destructive) / 0.05); border: 1px solid hsl(var(--destructive) / 0.2); border-radius: var(--radius); padding: 12px 14px; margin-bottom: var(--gap-md);">
            <span style="font-size: 13px; display: block; margin-bottom: 8px;">
              Are you sure you want to revoke this key? Requests using it will be rejected.
            </span>
            <div style="display: flex; gap: 8px;">
              <button
                class="btn btn--danger btn--sm"
                onClick={() => handleDeleteKey(deletingKeyId()!)}
              >
                Revoke key
              </button>
              <button
                class="btn btn--outline btn--sm"
                onClick={() => setDeletingKeyId(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </Show>

        {/* -- Setup Instructions ---------------------- */}
        <h2 class="settings-section__title">Setup</h2>
        <Show
          when={!apiKeyData.loading}
          fallback={<div class="skeleton skeleton--rect" style="width: 100%; height: 200px;" />}
        >
          <Show when={apiKeyData.error}>
            <div style="background: hsl(var(--chart-5) / 0.1); border: 1px solid hsl(var(--chart-5) / 0.3); border-radius: var(--radius); padding: 10px 14px; margin-bottom: var(--gap-md); font-size: var(--font-size-sm);">
              Could not load your API key. Use <strong>Rotate all keys</strong> above to generate a new
              one.
            </div>
          </Show>
          <div class="settings-card" style="padding: var(--gap-lg);">
            <SetupStepAddProvider
              apiKey={rotatedKey() ?? keyData()?.apiKey ?? null}
              keyPrefix={keyData()?.keyPrefix ?? null}
              baseUrl={baseUrl()}
              hideFullKey
              platform={currentPlatform()}
            />
          </div>
        </Show>
      </ErrorBoundary>

      {/* -- Danger Zone -------------------------------- */}
      <h2 class="settings-section__title settings-section__title--danger">Danger zone</h2>
      <div class="settings-card settings-card--danger">
        <div class="settings-card__row">
          <div class="settings-card__label">
            <span class="settings-card__label-title">Delete this harness</span>
            <span class="settings-card__label-desc">
              Permanently delete this harness, its API key, and all messages and analytics. This
              action cannot be undone.
            </span>
          </div>
          <div class="settings-card__control">
            <button
              class="btn btn--danger btn--sm"
              onClick={() => {
                setShowDeleteModal(true);
                setDeleteConfirmName('');
              }}
            >
              Delete harness
            </button>
          </div>
        </div>
      </div>

      {/* -- Delete Modal ------------------------------ */}
      <Show when={showDeleteModal()}>
        <div
          class="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowDeleteModal(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowDeleteModal(false);
          }}
        >
          <div
            class="modal-card"
            style="max-width: 440px;"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-agent-modal-title"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
                e.preventDefault();
                handleDeleteAgent();
              }
            }}
          >
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--gap-lg);">
              <h3 id="delete-agent-modal-title" style="margin: 0; font-size: var(--font-size-lg);">
                Delete {agentName()}
              </h3>
              <button
                style="background: none; border: none; cursor: pointer; color: hsl(var(--muted-foreground)); padding: 4px;"
                onClick={() => setShowDeleteModal(false)}
                aria-label="Close"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <p style="font-size: var(--font-size-sm); color: hsl(var(--muted-foreground)); margin-bottom: var(--gap-md);">
              This will permanently delete the{' '}
              <strong style="color: hsl(var(--foreground));">{agentName()}</strong> harness and all
              its data. This action cannot be undone.
            </p>
            <label
              for="delete-confirm-input"
              style="display: block; font-size: var(--font-size-sm); color: hsl(var(--foreground)); margin-bottom: var(--gap-sm);"
            >
              To confirm, type <strong>"{agentName()}"</strong> in the box below
            </label>
            <input
              ref={(el) => setTimeout(() => el.focus(), 200)}
              id="delete-confirm-input"
              class="auth-form__input"
              type="text"
              value={deleteConfirmName()}
              onInput={(e) => setDeleteConfirmName(e.currentTarget.value)}
              placeholder={agentName()}
              style="width: 100%; margin-bottom: var(--gap-lg);"
            />
            <button
              class="btn btn--danger btn--sm"
              style="width: 100%;"
              disabled={deleteConfirmName() !== agentName() || deleting()}
              onClick={handleDeleteAgent}
            >
              {deleting() ? (
                <>
                  <span class="spinner" />
                  <span class="sr-only">Deleting...</span>
                </>
              ) : (
                'Delete this harness'
              )}
            </button>
          </div>
        </div>
      </Show>

      {/* -- Change Type Modal ----------------------- */}
      <Show when={showTypeModal()}>
        <div
          class="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTypeModal(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowTypeModal(false);
          }}
        >
          <div
            class="modal-card"
            style="max-width: 540px;"
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-type-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 class="modal-card__title" id="change-type-modal-title">
              Change harness type
            </h2>
            <p class="modal-card__desc">Select the new type and platform for this harness.</p>

            <AgentTypeGrid
              category={modalCategory()}
              platform={modalPlatform()}
              onCategoryChange={(c) => {
                setModalCategory(c);
                setModalPlatform(PLATFORMS_BY_CATEGORY[c][0] ?? null);
              }}
              onPlatformChange={setModalPlatform}
              disabled={savingType()}
            />

            <div class="modal-card__footer">
              <button
                class="btn btn--primary btn--sm"
                onClick={handleSaveType}
                disabled={savingType() || !modalCategory() || !modalPlatform()}
              >
                {savingType() ? <span class="spinner" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </Show>

      <SetupModal
        open={showSetupModal()}
        agentName={agentName()}
        agentPlatform={currentPlatform()}
        agentCategory={currentCategory()}
        onClose={() => setShowSetupModal(false)}
        onDone={() => setShowSetupModal(false)}
      />
    </div>
  );
};

export default Settings;
