package com.nurion.arkaon.contacts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidContactMapperTest {

    @Test
    fun groupsPhonesByContactId() {
        val grouped = AndroidContactMapper.group(
            listOf(
                RawPhoneRow("10", "홍길동", "010-1111-2222"),
                RawPhoneRow("10", "홍길동", "02-123-4567"),
                RawPhoneRow("11", "김철수", "010-9999-0000")
            )
        )

        assertEquals(2, grouped.size)
        assertEquals("10", grouped[0].id)
        assertEquals(listOf("010-1111-2222", "02-123-4567"), grouped[0].phones)
        assertEquals("김철수", grouped[1].name)
    }

    @Test
    fun skipsEmptyContactId() {
        val grouped = AndroidContactMapper.group(
            listOf(
                RawPhoneRow(" ", "무시", "010"),
                RawPhoneRow("1", "유지", "010-1")
            )
        )

        assertEquals(1, grouped.size)
        assertEquals("1", grouped[0].id)
    }

    @Test
    fun deduplicatesIdenticalPhones() {
        val grouped = AndroidContactMapper.group(
            listOf(
                RawPhoneRow("1", "A", "010-1"),
                RawPhoneRow("1", "A", "010-1")
            )
        )

        assertEquals(1, grouped[0].phones.size)
        assertTrue(grouped[0].phones.contains("010-1"))
    }
}
