package com.nurion.arkaon.permissions

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat

class PermissionController(
    private val context: Context
) {

    fun hasReadContacts(): Boolean {

        return ContextCompat
            .checkSelfPermission(
                context,
                Manifest.permission.READ_CONTACTS
            ) ==
            PackageManager.PERMISSION_GRANTED
    }

    companion object {

        const val READ_CONTACTS =
            Manifest.permission.READ_CONTACTS
    }
}
