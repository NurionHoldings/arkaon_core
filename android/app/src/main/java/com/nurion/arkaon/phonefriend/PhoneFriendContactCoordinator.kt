package com.nurion.arkaon.phonefriend

import com.nurion.arkaon.bridge.ContactAnalysisResponse
import com.nurion.arkaon.bridge.ContactReadResult
import com.nurion.arkaon.bridge.DeviceContactReader
import com.nurion.arkaon.bridge.DuplicateContactCandidate

/**
 * Coordinates permission → device READ → analyze API → UI copy.
 * Never merges/deletes. Never grants Authority.
 */
class PhoneFriendContactCoordinator(
    private val deviceBridge: DeviceContactReader,
    private val apiClient: ContactAnalyzeClient
) {

    data class UiState(
        val presence: String,
        val assistantText: String,
        val progressText: String,
        val proposalsText: String,
        val needsPermissionRequest: Boolean = false,
        val analysis: ContactAnalysisResponse? = null
    )

    fun isContactOrganizeUtterance(text: String): Boolean {
        val value = text.trim()
        return (value.contains("연락처") || value.contains("번호")) &&
            (
                value.contains("중복") ||
                    value.contains("정리") ||
                    value.contains("찾아")
            )
    }

    suspend fun handleUtterance(utterance: String): UiState {
        if (!isContactOrganizeUtterance(utterance)) {
            return UiState(
                presence = "응, 듣고 있어.",
                assistantText =
                    "지금은 연락처 중복 찾기부터 도와드릴게요. “연락처 중복 찾아줘”라고 말해 주세요.",
                progressText = "",
                proposalsText = ""
            )
        }

        return when (val read = deviceBridge.readContacts()) {
            is ContactReadResult.PermissionRequired ->
                UiState(
                    presence = "잠깐만, 확인해볼게.",
                    assistantText =
                        "연락처를 읽으려면 권한이 필요해요.\n읽기만 하고 수정하거나 삭제하지 않을게요.",
                    progressText =
                        "● 필요한 접근 권한을 확인하고 있어요.\n○ 사용자 확인 전에는 변경하지 않아요.",
                    proposalsText = "",
                    needsPermissionRequest = true
                )

            is ContactReadResult.Failure ->
                UiState(
                    presence = "이건 조심해야 할 것 같아.",
                    assistantText =
                        "연락처를 읽는 중 문제가 생겼어요. 연락처는 변경하지 않았어요.",
                    progressText = "✓ 여기서 멈췄어요. 이유를 알려드릴게요.",
                    proposalsText = ""
                )

            is ContactReadResult.Success ->
                analyzeSnapshot(read)
        }
    }

    suspend fun continueAfterPermissionGranted(): UiState {
        return when (val read = deviceBridge.readContacts()) {
            is ContactReadResult.PermissionRequired ->
                onPermissionDenied()

            is ContactReadResult.Failure ->
                UiState(
                    presence = "이건 조심해야 할 것 같아.",
                    assistantText =
                        "연락처를 읽는 중 문제가 생겼어요. 연락처는 변경하지 않았어요.",
                    progressText = "✓ 여기서 멈췄어요. 이유를 알려드릴게요.",
                    proposalsText = ""
                )

            is ContactReadResult.Success ->
                analyzeSnapshot(read)
        }
    }

    fun onPermissionDenied(): UiState {
        return UiState(
            presence = "이건 조심해야 할 것 같아.",
            assistantText =
                "연락처를 읽으려면 권한이 필요해요. 읽기만 하고 수정하거나 삭제하지 않을게요.",
            progressText = "✓ 여기서 멈췄어요. 연락처는 읽지 않았어요.",
            proposalsText = ""
        )
    }

    private suspend fun analyzeSnapshot(
        read: ContactReadResult.Success
    ): UiState {
        val analysis = try {
            apiClient.analyzeContacts(read.snapshot, method = "DUPLICATES")
        } catch (_: Exception) {
            return UiState(
                presence = "이건 조심해야 할 것 같아.",
                assistantText =
                    "지금은 분석을 완료하지 못했어요. 연락처는 변경하지 않았어요.",
                progressText = "✓ 여기서 멈췄어요. 이유를 알려드릴게요.",
                proposalsText = ""
            )
        }

        val safe = analysis.copy(
            authorityGranted = false,
            mutated = false,
            proposals = analysis.proposals.map {
                it.copy(
                    proposalOnly = true,
                    mergeAllowed = false,
                    deleteAllowed = false,
                    authorityGranted = false
                )
            }
        )

        val assistant =
            safe.assistantText?.takeIf { it.isNotBlank() }
                ?: if (safe.candidateCount > 0) {
                    "중복 가능성이 있는 연락처 ${safe.candidateCount}쌍을 찾았어요.\n아직 아무것도 합치거나 삭제하지 않았어요."
                } else {
                    "지금 기준으로 정리 후보를 찾지 못했어요. 연락처는 변경하지 않았어요."
                }

        return UiState(
            presence = if (safe.candidateCount > 0) "다 했어." else "지금 살펴보고 있어.",
            assistantText = assistant,
            progressText =
                "✓ 요청 이해\n✓ 권한 확인\n✓ 번호와 이름 비교\n✓ 변경하지 않음",
            proposalsText = formatProposals(safe.proposals),
            analysis = safe
        )
    }

    companion object {
        fun formatProposals(
            proposals: List<DuplicateContactCandidate>
        ): String {
            if (proposals.isEmpty()) {
                return "표시할 후보가 없어요."
            }

            return proposals.mapIndexed { index, item ->
                val names = item.names.joinToString(" / ").ifBlank { "(이름 없음)" }
                val phones = item.phones.joinToString(", ")
                val phonePart = if (phones.isBlank()) "" else " ($phones)"
                "${index + 1}. $names$phonePart · ${item.level}"
            }.joinToString("\n")
        }
    }
}
