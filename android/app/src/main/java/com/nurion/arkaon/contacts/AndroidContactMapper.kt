package com.nurion.arkaon.contacts

import com.nurion.arkaon.bridge.DeviceContact

data class RawPhoneRow(
    val contactId: String,
    val displayName: String?,
    val phoneNumber: String?
)

object AndroidContactMapper {

    fun group(
        rows: List<RawPhoneRow>
    ): List<DeviceContact> {

        val grouped =
            linkedMapOf<String, MutableContact>()

        rows.forEach { row ->

            val id =
                row.contactId.trim()

            if (id.isEmpty()) {
                return@forEach
            }

            val current =
                grouped.getOrPut(id) {
                    MutableContact(
                        id = id,
                        name =
                            row.displayName
                                ?.trim()
                                .orEmpty()
                    )
                }

            if (
                current.name.isEmpty() &&
                !row.displayName
                    .isNullOrBlank()
            ) {
                current.name =
                    row.displayName.trim()
            }

            val phone =
                row.phoneNumber
                    ?.trim()
                    .orEmpty()

            if (phone.isNotEmpty()) {
                current.phones.add(phone)
            }
        }

        return grouped.values.map {
            DeviceContact(
                id = it.id,
                name = it.name,
                phones =
                    it.phones
                        .distinct()
            )
        }
    }

    private data class MutableContact(
        val id: String,
        var name: String,
        val phones:
            MutableList<String> =
                mutableListOf()
    )
}
