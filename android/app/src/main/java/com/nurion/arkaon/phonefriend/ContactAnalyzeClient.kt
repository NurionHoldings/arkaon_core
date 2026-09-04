package com.nurion.arkaon.phonefriend

import com.nurion.arkaon.bridge.ContactAnalysisResponse
import com.nurion.arkaon.bridge.ContactSnapshot

fun interface ContactAnalyzeClient {
    suspend fun analyzeContacts(
        snapshot: ContactSnapshot,
        method: String
    ): ContactAnalysisResponse
}
