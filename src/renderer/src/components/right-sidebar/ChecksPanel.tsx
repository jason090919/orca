import React from 'react'
import { Ellipsis, GitMerge, Link, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  getTerminalUrlOrcaBrowserHint,
  getTerminalUrlSystemBrowserHint
} from '../terminal-pane/terminal-link-open-hints'
import {
  ConflictingFilesSection,
  MergeConflictNotice,
  ChecksList,
  isMutablePRConversationComment,
  PRCommentsList,
  PRTriageStrip
} from './checks-panel-content'
import { ENTRY_REFRESH_GRACE_MS, shouldEntryRefresh } from './checks-entry-refresh'
import type {
  GitLabDiscussionResolveResult,
  GitLabWorkItemDetails,
  PRInfo,
  PRCheckDetail,
  PRCheckRunDetails,
  PRComment
} from '../../../../shared/types'
import { getConnectionId } from '@/lib/connection-context'
import {
  buildResolvePullRequestConflictsPrompt,
  pickDefaultSourceControlAgent
} from './SourceControl'
import {
  buildFixBrokenChecksPrompt,
  getBrokenChecks,
  getCheckDetailsPromptKey
} from '../pr-checks-fix-prompt'
import {
  buildPRCommentsResolutionPrompt,
  isResolvablePRCommentGroup
} from '../pr-comments-resolution-prompt'
import { startFixChecksAgent } from '@/lib/fix-checks-agent-launch'
import type {
  HostedReviewCreationEligibility,
  HostedReviewProvider
} from '../../../../shared/hosted-review'
import { resolveHostedReviewCreationProvider } from '../../../../shared/hosted-review-creation-providers'
import { normalizeHostedReviewHeadRef } from '../../../../shared/hosted-review-refs'
import { getHostedReviewCacheKey, refreshHostedReviewCard } from '@/store/slices/hosted-review'
import { toast } from 'sonner'
import { useConfirmationDialog } from '@/components/confirmation-dialog'
import { type ChecksPanelReview, gitHubPRToChecksPanelReview } from './checks-panel-review'
import { giteaPRChecksToPRChecks, giteaIssueCommentsToPRComments } from './checks-panel-gitea'
import type { GiteaComment, GiteaPRCheck } from '../../../../shared/gitea-types'
import {
  checksPanelAsyncResultKey,
  checksPanelHostedReviewAsyncResultKey,
  shouldCommitChecksPanelAsyncResult
} from './checks-panel-async-result-key'
import {
  markPRCommentThreadResolved,
  restorePRCommentThreadSnapshot
} from './pr-comment-thread-resolution'
import { installWindowVisibilityTimeoutPoller } from '@/lib/window-visibility-timeout-poller'
import {
  getChecksPanelEmptyStateCopy,
  shouldShowChecksPanelPublishBranchAction
} from './checks-panel-empty-state'
import {
  getRuntimeGitScope,
  getRuntimeGitStatus,
  getRuntimeGitUpstreamStatus
} from '@/runtime/runtime-git-client'
import {
  buildChecksPanelGitStatusContextKey,
  readChecksPanelPublishActionGitStatus,
  readChecksPanelGitStatusSnapshot,
  shouldClearChecksPanelGitStatusSnapshot,
  shouldCoalesceChecksPanelGitStatusSnapshotRefresh,
  shouldCommitChecksPanelGitStatusSnapshot,
  shouldPollChecksPanelRuntimeSshStatus,
  type ChecksPanelGitStatusSnapshot
} from './checks-panel-git-status-snapshot'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { useMountedRef } from '@/hooks/useMountedRef'
import { callRuntimeRpc, getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { gitLabPipelineJobsToPRChecks } from '../../../../shared/gitlab-pipeline-checks'
import { getWorktreeGitIdentityDisplay } from '@/lib/worktree-git-identity-display'
import { SourceControlAgentActionDialog } from './SourceControlAgentActionDialog'
import { readSourceControlLaunchRecipeAgentId } from '@/lib/source-control-launch-agent-selection'
import {
  DEFAULT_SOURCE_CONTROL_AI_PR_CREATION_DEFAULTS,
  resolveSourceControlActionRecipe,
  resolveSourceControlAiForOperation,
  resolveSourceControlAiPrCreationDefaults
} from '../../../../shared/source-control-ai'
import { getCommitMessageModelDiscoveryHostKeyForScope } from '../../../../shared/commit-message-host-key'
import {
  type SourceControlActionRecipe,
  type SourceControlLaunchActionId
} from '../../../../shared/source-control-ai-actions'
import {
  saveSourceControlActionRecipe,
  type SourceControlAiWriteTarget
} from '../../../../shared/source-control-ai-recipe-save'
import { resolveSourceControlLaunchPlatform } from '@/lib/source-control-launch-platform'
import { getLocalProjectExecutionRuntimeContext } from '@/lib/local-preflight-context'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { CreateHostedReviewComposer } from './CreateHostedReviewComposer'
import { formatCreateError } from './create-pull-request-review-copy'
import { stripBaseRef, useCreatePullRequestDialogFields } from './useCreatePullRequestDialogFields'
import { localizedHostedReviewCopy } from '@/i18n/hosted-review-localized-copy'
import { translate } from '@/i18n/i18n'
import { PullRequestIcon, prStateColor } from './checks-panel/check-presentation'
import { useChecksPanelControllerState } from './checks-panel/use-checks-panel-controller-state'
import { useChecksPanelContextState } from './checks-panel/use-checks-panel-context-state'
import { useChecksPanelReviewState } from './checks-panel/use-checks-panel-review-state'
import { useChecksPanelGeneration } from './checks-panel/use-checks-panel-generation'
import { useChecksPanelComposerState } from './checks-panel/use-checks-panel-composer-state'
import { useChecksPanelForegroundEffects } from './checks-panel/use-checks-panel-foreground-effects'
import { useChecksPanelGitStatusEffects } from './checks-panel/use-checks-panel-git-status-effects'
import { useChecksPanelConflictRefresh } from './checks-panel/use-checks-panel-conflict-refresh'
import { useChecksPanelPolling } from './checks-panel/use-checks-panel-polling'
import { useChecksPanelReviewData } from './checks-panel/use-checks-panel-review-data'
import { useChecksPanelManualRefresh } from './checks-panel/use-checks-panel-manual-refresh'
import { useChecksPanelEntryRefreshAndTitleActions } from './checks-panel/use-checks-panel-entry-refresh-and-title-actions'
import { useChecksPanelCommentResolution } from './checks-panel/use-checks-panel-comment-resolution'
import { useChecksPanelCommentMutations } from './checks-panel/use-checks-panel-comment-mutations'
import { useChecksPanelAiQueue } from './checks-panel/use-checks-panel-ai-queue'
import { useChecksPanelAiAcknowledgement } from './checks-panel/use-checks-panel-ai-acknowledgement'
import { useChecksPanelCheckAndReviewActions } from './checks-panel/use-checks-panel-check-and-review-actions'
import { useChecksPanelBranchActions } from './checks-panel/use-checks-panel-branch-actions'
import { useChecksPanelCreateReview } from './checks-panel/use-checks-panel-create-review'
import { ChecksPanelEmptyContent } from './checks-panel/empty-content'
import { ChecksPanelActiveContent } from './checks-panel/active-content'
import { HostedReviewUnlinkMenuItem } from '@/components/HostedReviewUnlinkMenuItem'

type ChecksPanelReviewHeaderProps = {
  review: ChecksPanelReview
  isRefreshing: boolean
  canUnlinkReview: boolean
  modifierHintDestination: ChecksPanelHostedReviewModifierDestination
  onRefresh: () => void
  onOpenReview: (event: React.MouseEvent<HTMLButtonElement>) => void
  onUnlinkReview: () => void
  onLinkAnotherReview: () => void
}

export function ChecksPanelReviewHeader({
  review,
  isRefreshing,
  canUnlinkReview,
  modifierHintDestination,
  onRefresh,
  onOpenReview,
  onUnlinkReview,
  onLinkAnotherReview
}: ChecksPanelReviewHeaderProps): React.JSX.Element {
  const reviewNumberLabel = review.provider === 'gitlab' ? `!${review.number}` : `#${review.number}`
  const ReviewIcon = review.provider === 'gitlab' ? GitMerge : PullRequestIcon
  const reviewHostLabel = review.provider === 'gitlab' ? 'GitLab' : 'GitHub'
  const moreActionsLabel =
    review.provider === 'gitlab'
      ? translate('auto.components.right.sidebar.ChecksPanel.gitlabMoreActions', 'More MR actions')
      : translate('auto.components.right.sidebar.ChecksPanel.653c105ecc', 'More PR actions')
  const openTitle = translate(
    'auto.components.right.sidebar.ChecksPanel.5c88c6db07',
    'Open on {{value0}}',
    { value0: reviewHostLabel }
  )
  const modifierHint =
    modifierHintDestination === 'system-browser'
      ? getTerminalUrlSystemBrowserHint()
      : modifierHintDestination === 'orca'
        ? getTerminalUrlOrcaBrowserHint()
        : null
  const title = modifierHint ? `${openTitle}. ${modifierHint}` : openTitle

  return (
    <div className="flex items-center gap-2">
      <ReviewIcon className="size-4 text-muted-foreground shrink-0" />
      <button
        type="button"
        className="rounded px-0.5 text-[12px] font-semibold text-foreground underline decoration-border underline-offset-2 hover:text-foreground hover:decoration-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        title={title}
        onClick={onOpenReview}
      >
        {reviewNumberLabel}
      </button>
      <span
        className={cn(
          'text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border',
          prStateColor(review.state)
        )}
      >
        {review.state}
      </span>
      <div className="flex-1" />
      <button
        className="cursor-pointer rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-50"
        title={translate('auto.components.right.sidebar.ChecksPanel.7f4489f370', 'Refresh')}
        onClick={onRefresh}
        disabled={isRefreshing}
      >
        <RefreshCw className={cn('size-3.5', isRefreshing && 'animate-spin')} />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={moreActionsLabel}
            title={moreActionsLabel}
            className="text-muted-foreground hover:text-foreground"
          >
            <Ellipsis className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <HostedReviewUnlinkMenuItem
            reviewLabel={review.provider === 'gitlab' ? 'MR' : 'PR'}
            reviewIdentifier={reviewNumberLabel}
            providerLabel={reviewHostLabel}
            disabled={!canUnlinkReview}
            onSelect={onUnlinkReview}
          />
          <DropdownMenuItem onSelect={onLinkAnotherReview}>
            <Link className="size-3.5" />
            {review.provider === 'gitlab'
              ? translate(
                  'auto.components.right.sidebar.ChecksPanel.gitlabLinkAnother',
                  'Link another MR'
                )
              : translate(
                  'auto.components.right.sidebar.ChecksPanel.07871c0589',
                  'Link another PR'
                )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export default function ChecksPanel(): React.JSX.Element {
  const baseModel = useChecksPanelControllerState()
  const contextModel = Object.assign(baseModel, useChecksPanelContextState(baseModel))
  const reviewModel = Object.assign(contextModel, useChecksPanelReviewState(contextModel))
  const generationModel = Object.assign(reviewModel, useChecksPanelGeneration(reviewModel))
  const composerModel = Object.assign(generationModel, useChecksPanelComposerState(generationModel))
  useChecksPanelForegroundEffects(composerModel)
  useChecksPanelGitStatusEffects(composerModel)
  useChecksPanelConflictRefresh(composerModel)
  const pollingModel = Object.assign(composerModel, useChecksPanelPolling(composerModel))
  const dataModel = Object.assign(pollingModel, useChecksPanelReviewData(pollingModel))
  const refreshModel = Object.assign(dataModel, useChecksPanelManualRefresh(dataModel))
  const entryModel = Object.assign(
    refreshModel,
    useChecksPanelEntryRefreshAndTitleActions(refreshModel)
  )
  const resolutionModel = Object.assign(entryModel, useChecksPanelCommentResolution(entryModel))
  const mutationModel = Object.assign(
    resolutionModel,
    useChecksPanelCommentMutations(resolutionModel)
  )
  const queueModel = Object.assign(mutationModel, useChecksPanelAiQueue(mutationModel))
  const acknowledgementModel = Object.assign(
    queueModel,
    useChecksPanelAiAcknowledgement(queueModel)
  )
  const reviewActionsModel = Object.assign(
    acknowledgementModel,
    useChecksPanelCheckAndReviewActions(acknowledgementModel)
  )
  const branchActionsModel = Object.assign(
    reviewActionsModel,
    useChecksPanelBranchActions(reviewActionsModel)
  )
  const model = Object.assign(branchActionsModel, useChecksPanelCreateReview(branchActionsModel))

  if (!model.activeWorktree || model.isFolder || !model.activeReview) {
    return <ChecksPanelEmptyContent model={model} />
  }

  return <ChecksPanelActiveContent model={model} ReviewHeaderComponent={ChecksPanelReviewHeader} />
}
