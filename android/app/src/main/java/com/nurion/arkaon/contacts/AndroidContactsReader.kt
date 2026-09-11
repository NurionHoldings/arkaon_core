package com.nurion.arkaon.contacts

import android.content.ContentResolver
import android.provider.ContactsContract
import com.nurion.arkaon.bridge.DeviceContact

class AndroidContactsReader(
    private val resolver: ContentResolver
) {

    fun read(): List<DeviceContact> {

        val rows =
            mutableListOf<RawPhoneRow>()

        val projection =
            arrayOf(
                ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
            )

        resolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            projection,
            null,
            null,
            null
        )?.use { cursor ->

            val idIndex =
                cursor.getColumnIndexOrThrow(
                    ContactsContract.CommonDataKinds.Phone.CONTACT_ID
                )

            val nameIndex =
                cursor.getColumnIndexOrThrow(
                    ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME
                )

            val phoneIndex =
                cursor.getColumnIndexOrThrow(
                    ContactsContract.CommonDataKinds.Phone.NUMBER
                )

            while (
                cursor.moveToNext()
            ) {

                rows += RawPhoneRow(
                    contactId =
                        cursor
                            .getLong(idIndex)
                            .toString(),

                    displayName =
                        cursor
                            .getString(nameIndex),

                    phoneNumber =
                        cursor
                            .getString(phoneIndex)
                )
            }
        }

        return AndroidContactMapper
            .group(rows)
    }
}
