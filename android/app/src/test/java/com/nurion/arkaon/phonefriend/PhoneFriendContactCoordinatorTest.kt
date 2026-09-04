package com.nurion.arkaon.phonefriend

import com.nurion.arkaon.bridge.ContactAnalysisResponse
import com.nurion.arkaon.bridge.ContactReadResult
import com.nurion.arkaon.bridge.ContactSnapshot
import com.nurion.arkaon.bridge.DeviceContact
import com.nurion.arkaon.bridge.DeviceContactReader
import com.nurion.arkaon.bridge.DuplicateContactCandidate
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneFriendContactCoordinatorTest {

    @Test
    fun detectsContactOrganizeUtterance() {
        val coordinator = PhoneFriendContactCoordinator(
            deviceBridge = DeviceContactReader {
                ContactReadResult.PermissionRequired
            },
            apiClient = ContactAnalyzeClient { _, _ ->
                error("unused")
            }
        )

        assertTrue(coordinator.isContactOrganizeUtterance("연락처 중복 찾아줘"))
        assertFalse(coordinator.isContactOrganizeUtterance("날씨 알려줘"))
    }

    @Test
    fun permissionRequiredAsksWithoutMutating() = runBlocking {
        val coordinator = PhoneFriendContactCoordinator(
            deviceBridge = DeviceContactReader {
                ContactReadResult.PermissionRequired
            },
            apiClient = ContactAnalyzeClient { _, _ ->
                error("should not call api")
            }
        )

        val state = coordinator.handleUtterance("연락처 중복 찾아줘")
        assertTrue(state.needsPermissionRequest)
        assertTrue(state.assistantText.contains("권한이 필요"))
        assertTrue(state.assistantText.contains("삭제하지"))
    }

    @Test
    fun successShowsProposalsWithoutAuthority() = runBlocking {
        val snapshot = ContactSnapshot(
            contacts = listOf(
                DeviceContact("1", "홍길동", listOf("010-1234-5678")),
                DeviceContact("2", "홍길동", listOf("01012345678"))
            )
        )

        val coordinator = PhoneFriendContactCoordinator(
            deviceBridge = DeviceContactReader {
                ContactReadResult.Success(snapshot)
            },
            apiClient = ContactAnalyzeClient { _, _ ->
                ContactAnalysisResponse(
                    ok = true,
                    method = "DUPLICATES",
                    candidateCount = 1,
                    proposals = listOf(
                        DuplicateContactCandidate(
                            id = "dup:1:2",
                            contactIds = listOf("1", "2"),
                            names = listOf("홍길동", "홍길동"),
                            phones = listOf("01012345678"),
                            score = 0.95,
                            level = "HIGH"
                        )
                    ),
                    assistantText =
                        "중복 가능성이 있는 연락처 1쌍을 찾았어요. 아직 아무것도 합치거나 삭제하지 않았어요."
                )
            }
        )

        val state = coordinator.handleUtterance("중복 번호 찾아줘")
        assertEquals(false, state.analysis?.authorityGranted)
        assertEquals(false, state.analysis?.mutated)
        assertTrue(state.proposalsText.contains("홍길동"))
        assertTrue(state.assistantText.contains("합치거나 삭제하지"))
    }

    @Test
    fun apiFailureIsGraceful() = runBlocking {
        val coordinator = PhoneFriendContactCoordinator(
            deviceBridge = DeviceContactReader {
                ContactReadResult.Success(ContactSnapshot(contacts = emptyList()))
            },
            apiClient = ContactAnalyzeClient { _, _ ->
                throw RuntimeException("network")
            }
        )

        val state = coordinator.handleUtterance("연락처 정리해줘")
        assertTrue(state.assistantText.contains("분석을 완료하지 못했어요"))
        assertTrue(state.assistantText.contains("변경하지"))
    }

    @Test
    fun formatsProposalsSafely() {
        val text = PhoneFriendContactCoordinator.formatProposals(
            listOf(
                DuplicateContactCandidate(
                    id = "dup:1:2",
                    contactIds = listOf("1", "2"),
                    names = listOf("홍길동", "홍길동"),
                    phones = listOf("01012345678"),
                    score = 0.9,
                    level = "HIGH"
                )
            )
        )

        assertTrue(text.contains("홍길동"))
        assertTrue(text.contains("HIGH"))
    }
}
