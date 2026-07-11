<script setup lang="ts">
import {
  UPLOAD_AGREEMENT_BODY, UPLOAD_AGREEMENT_CHECKBOX, UPLOAD_AGREEMENT_CONTINUE_LABEL, UPLOAD_AGREEMENT_TITLE,
  UPLOAD_CORPUS_DIALOG_HINT, UPLOAD_CORPUS_DIALOG_TITLE, UPLOAD_RISK_CANCEL_LABEL, UPLOAD_RISK_CONFIRM_LABEL,
  UPLOAD_RISK_DIALOG_MESSAGE, UPLOAD_RISK_DIALOG_TITLE, UPLOAD_TRANSCRIPT_CONFIRM_MESSAGE,
  UPLOAD_TRANSCRIPT_CONFIRM_TITLE, UPLOAD_TRANSCRIPT_DIALOG_HINT, UPLOAD_TRANSCRIPT_DIALOG_TITLE,
  VOICE_NAME_PROMPT_HINT, VOICE_NAME_PROMPT_TITLE
} from '../../constants/voiceForge'
import type { CorpusData } from '../../types/corpus'
import VoiceForgeCorpusEditor from './VoiceForgeCorpusEditor.vue'
import type { BodyPart } from '../../types/corpus'

defineProps<{
  showUploadFlowBackdrop: boolean
  showUploadRiskDialog: boolean
  showUploadAgreement: boolean
  showUploadTranscriptDialog: boolean
  showUploadTranscriptConfirmDialog: boolean
  showUploadCorpusDialog: boolean
  showUploadNameDialog: boolean
  showNameDialog: boolean
  isUploadFlowActive: boolean
  parseError: string
  uploadAgreementChecked: boolean
  uploadAgreementSecondsLeft: number
  uploadReferenceText: string
  uploadWavFileName: string
  pendingUploadName: string
  pendingSampleName: string
  uploadCorpus: CorpusData
  agreementWaitText: string
}>()

defineEmits<{
  'update:uploadAgreementChecked': [value: boolean]
  'update:uploadReferenceText': [value: string]
  'update:pendingUploadName': [value: string]
  'update:pendingSampleName': [value: string]
  resetUploadFlow: []
  confirmUploadRisk: []
  continueAfterAgreement: []
  continueAfterTranscript: []
  backToTranscript: []
  openCorpus: []
  backToTranscriptConfirm: []
  continueAfterCorpus: []
  confirmUploadImport: []
  closeNameDialog: []
  confirmCreate: []
  addUploadLine: [part: BodyPart]
  removeUploadLine: [part: BodyPart, index: number]
}>()
</script>

<template>
  <Teleport to="body">
    <div v-if="showUploadFlowBackdrop" class="name-dialog-overlay name-dialog-overlay--teleport name-dialog-overlay--upload-flow" aria-hidden="true" />
    <div v-if="showUploadRiskDialog" class="name-dialog-overlay name-dialog-overlay--teleport name-dialog-overlay--upload-flow">
      <div class="name-dialog agreement-dialog" role="dialog" aria-modal="true">
        <h3 class="name-dialog__title">{{ UPLOAD_RISK_DIALOG_TITLE }}</h3>
        <p class="hint">{{ UPLOAD_RISK_DIALOG_MESSAGE }}</p>
        <div class="name-dialog__actions">
          <button type="button" class="secondary-btn" @click="$emit('resetUploadFlow')">{{ UPLOAD_RISK_CANCEL_LABEL }}</button>
          <button type="button" class="apply-btn" @click="$emit('confirmUploadRisk')">{{ UPLOAD_RISK_CONFIRM_LABEL }}</button>
        </div>
      </div>
    </div>
    <div v-if="showUploadAgreement" class="name-dialog-overlay name-dialog-overlay--teleport name-dialog-overlay--upload-flow">
      <div class="name-dialog agreement-dialog" role="dialog" aria-modal="true">
        <h3 class="name-dialog__title">{{ UPLOAD_AGREEMENT_TITLE }}</h3>
        <pre class="agreement-body">{{ UPLOAD_AGREEMENT_BODY }}</pre>
        <label class="agreement-check">
          <input :checked="uploadAgreementChecked" type="checkbox" @change="$emit('update:uploadAgreementChecked', ($event.target as HTMLInputElement).checked)" />
          <span>{{ UPLOAD_AGREEMENT_CHECKBOX }}</span>
        </label>
        <p class="hint agreement-wait">{{ agreementWaitText }}</p>
        <div class="name-dialog__actions">
          <button type="button" class="secondary-btn" @click="$emit('resetUploadFlow')">取消</button>
          <button type="button" class="apply-btn" :disabled="!uploadAgreementChecked || uploadAgreementSecondsLeft > 0" @click="$emit('continueAfterAgreement')">{{ UPLOAD_AGREEMENT_CONTINUE_LABEL }}</button>
        </div>
      </div>
    </div>
    <div v-if="showUploadTranscriptDialog" class="name-dialog-overlay name-dialog-overlay--teleport name-dialog-overlay--upload-flow" @click.stop>
      <div class="name-dialog" role="dialog" aria-modal="true" @click.stop>
        <h3 class="name-dialog__title">{{ UPLOAD_TRANSCRIPT_DIALOG_TITLE }}</h3>
        <p v-if="uploadWavFileName" class="hint">已选择：{{ uploadWavFileName }}</p>
        <p class="hint">{{ UPLOAD_TRANSCRIPT_DIALOG_HINT }}</p>
        <textarea :value="uploadReferenceText" class="instruct-textarea upload-reference-text" rows="5" spellcheck="false" placeholder="请填写 WAV 里实际说出的完整原文" @input="$emit('update:uploadReferenceText', ($event.target as HTMLTextAreaElement).value)" />
        <div class="name-dialog__actions">
          <button type="button" class="secondary-btn" @click="$emit('resetUploadFlow')">取消</button>
          <button type="button" class="apply-btn" @click="$emit('continueAfterTranscript')">下一步</button>
        </div>
      </div>
    </div>
    <div v-if="showUploadTranscriptConfirmDialog" class="name-dialog-overlay name-dialog-overlay--teleport name-dialog-overlay--upload-flow" @click.stop>
      <div class="name-dialog" role="dialog" aria-modal="true" @click.stop>
        <h3 class="name-dialog__title">{{ UPLOAD_TRANSCRIPT_CONFIRM_TITLE }}</h3>
        <p class="hint">{{ UPLOAD_TRANSCRIPT_CONFIRM_MESSAGE }}</p>
        <pre class="agreement-body transcript-preview">{{ uploadReferenceText.trim() }}</pre>
        <div class="name-dialog__actions">
          <button type="button" class="secondary-btn" @click="$emit('backToTranscript')">返回修改</button>
          <button type="button" class="apply-btn" @click="$emit('openCorpus')">确认无误，继续</button>
        </div>
      </div>
    </div>
    <div v-if="showUploadCorpusDialog" class="name-dialog-overlay name-dialog-overlay--teleport name-dialog-overlay--upload-flow" @click.stop>
      <div class="name-dialog upload-corpus-dialog" role="dialog" aria-modal="true" @click.stop>
        <h3 class="name-dialog__title">{{ UPLOAD_CORPUS_DIALOG_TITLE }}</h3>
        <p class="hint">{{ UPLOAD_CORPUS_DIALOG_HINT }}</p>
        <VoiceForgeCorpusEditor key-prefix="upload" :corpus="uploadCorpus" @add-line="$emit('addUploadLine', $event)" @remove-line="(p, i) => $emit('removeUploadLine', p, i)" />
        <div class="name-dialog__actions">
          <button type="button" class="secondary-btn" @click="$emit('backToTranscriptConfirm')">返回</button>
          <button type="button" class="apply-btn" @click="$emit('continueAfterCorpus')">下一步，命名声线</button>
        </div>
      </div>
    </div>
    <div v-if="showUploadNameDialog" class="name-dialog-overlay name-dialog-overlay--teleport name-dialog-overlay--upload-flow" @click.stop>
      <div class="name-dialog" role="dialog" aria-modal="true" @click.stop>
        <h3 class="name-dialog__title">{{ VOICE_NAME_PROMPT_TITLE }}</h3>
        <p class="hint">{{ VOICE_NAME_PROMPT_HINT }}</p>
        <p v-if="uploadWavFileName" class="hint">已选择：{{ uploadWavFileName }}</p>
        <input :value="pendingUploadName" class="name-dialog__input" type="text" maxlength="32" placeholder="例如：文静雪澜" @input="$emit('update:pendingUploadName', ($event.target as HTMLInputElement).value)" @keyup.enter="$emit('confirmUploadImport')" />
        <div class="name-dialog__actions">
          <button type="button" class="secondary-btn" @click="$emit('resetUploadFlow')">取消</button>
          <button type="button" class="apply-btn" @click="$emit('confirmUploadImport')">开始导入</button>
        </div>
      </div>
    </div>
    <p v-if="isUploadFlowActive && parseError" class="upload-flow-error" role="alert">{{ parseError }}</p>
  </Teleport>
  <Teleport to="body">
    <div v-if="showNameDialog" class="name-dialog-overlay name-dialog-overlay--teleport" @click.self="$emit('closeNameDialog')">
      <div class="name-dialog" role="dialog" aria-modal="true">
        <h3 class="name-dialog__title">{{ VOICE_NAME_PROMPT_TITLE }}</h3>
        <p class="hint">{{ VOICE_NAME_PROMPT_HINT }}</p>
        <input :value="pendingSampleName" class="name-dialog__input" type="text" maxlength="32" placeholder="例如：文静雪澜" @input="$emit('update:pendingSampleName', ($event.target as HTMLInputElement).value)" @keyup.enter="$emit('confirmCreate')" />
        <div class="name-dialog__actions">
          <button type="button" class="secondary-btn" @click="$emit('closeNameDialog')">取消</button>
          <button type="button" class="apply-btn" @click="$emit('confirmCreate')">开始生成</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.name-dialog-overlay--teleport { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; background: rgba(15, 23, 42, 0.35); }
.name-dialog-overlay--teleport .name-dialog { width: min(320px, calc(100vw - 32px)); padding: 16px; border-radius: 12px; background: #fff; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.16); }
.name-dialog-overlay--teleport .name-dialog__title { margin: 0 0 8px; font-size: 15px; font-weight: 600; color: #111827; }
.name-dialog-overlay--teleport .hint { margin: 0 0 8px; font-size: 12px; line-height: 1.5; color: #6b7280; }
.name-dialog-overlay--teleport .instruct-textarea, .name-dialog-overlay--teleport .name-dialog__input { width: 100%; box-sizing: border-box; margin-top: 8px; padding: 10px 12px; border: 1px solid rgba(0,0,0,.12); border-radius: 8px; font-size: 13px; }
.name-dialog-overlay--teleport .instruct-textarea { resize: vertical; }
.name-dialog-overlay--teleport .name-dialog__actions { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
.name-dialog-overlay--teleport .apply-btn, .name-dialog-overlay--teleport .secondary-btn { width: 100%; padding: 10px 12px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; }
.name-dialog-overlay--teleport .apply-btn { border: none; background: linear-gradient(135deg, #ec4899, #f472b6); color: #fff; }
.name-dialog-overlay--teleport .apply-btn:disabled { opacity: .6; cursor: wait; }
.name-dialog-overlay--teleport .secondary-btn { border: 1px solid rgba(0,0,0,.12); background: #fff; color: #374151; }
.name-dialog-overlay--teleport .agreement-body { margin: 0 0 10px; padding: 10px; border-radius: 8px; background: #f9fafb; font-size: 12px; line-height: 1.55; white-space: pre-wrap; color: #374151; }
.name-dialog-overlay--teleport .agreement-check { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; line-height: 1.5; color: #374151; }
.name-dialog-overlay--teleport .upload-corpus-dialog { width: min(420px, calc(100vw - 24px)); max-height: min(80vh, 720px); overflow: auto; }
.name-dialog-overlay--teleport.name-dialog-overlay--upload-flow { background: transparent; pointer-events: auto; }
.name-dialog-overlay--teleport.name-dialog-overlay--upload-flow .name-dialog { pointer-events: auto; box-shadow: 0 16px 40px rgba(15, 23, 42, 0.22); }
.name-dialog-overlay--teleport .transcript-preview { max-height: 160px; overflow: auto; }
.name-dialog-overlay--teleport .agreement-dialog { max-height: min(80vh, 520px); overflow-y: auto; }
.name-dialog-overlay--teleport .agreement-wait { margin-top: 8px; text-align: center; }
.upload-flow-error { position: fixed; left: 50%; bottom: 24px; z-index: 10001; max-width: min(360px, calc(100vw - 32px)); margin: 0; padding: 10px 14px; transform: translateX(-50%); border-radius: 10px; background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; font-size: 12px; line-height: 1.5; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.12); pointer-events: none; }
</style>
