'use strict';

/**
 * AndroidContactAdapterContract v0.1
 * ─────────────────────────────────────────────────
 *
 * 실제 Android ContactsContract 구현체가 지켜야 할 계약.
 *
 * 이 파일 자체는 Android API를 호출하지 않는다.
 *
 * v0.1:
 * - READ_CONTACTS만 허용
 * - merge/delete/write 없음
 * - raw biometric/identity와 무관
 * - Adapter는 Authority 생성 불가
 */

const ANDROID_CONTACT_PERMISSION = Object.freeze({
  READ: 'android.permission.READ_CONTACTS',
  WRITE: 'android.permission.WRITE_CONTACTS',
});

const CONTACT_ADAPTER_CAPABILITY = Object.freeze({
  READ: 'CONTACT_READ',
  ANALYZE: 'CONTACT_ANALYZE',
  PROPOSE: 'CONTACT_PROPOSE',
});

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function validateContactRecord(contact) {
  if (!contact || typeof contact !== 'object' || Array.isArray(contact)) {
    throw new Error('contact must be an object');
  }

  if (contact.id === undefined || contact.id === null) {
    throw new Error('contact.id is required');
  }

  if (contact.phones !== undefined && !Array.isArray(contact.phones)) {
    throw new Error('contact.phones must be an array');
  }

  return true;
}

function sanitizeAndroidContact(contact) {
  validateContactRecord(contact);

  return clone({
    id: String(contact.id),
    name: contact.name || contact.display_name || '',
    display_name: contact.display_name || contact.name || '',
    phones: Array.isArray(contact.phones) ? [...contact.phones] : [],
    emails: Array.isArray(contact.emails) ? [...contact.emails] : [],
    last_contacted_at: contact.last_contacted_at || null,
    last_call_at: contact.last_call_at || null,
    last_message_at: contact.last_message_at || null,
    updated_at: contact.updated_at || null,

    /**
     * 명시적 READ snapshot.
     */
    read_only: true,
  });
}

class AndroidContactAdapterContract {
  constructor() {
    this.authority_granted = false;
  }

  getRequiredPermissions() {
    return [ANDROID_CONTACT_PERMISSION.READ];
  }

  /**
   * 실제 구현체가 override 해야 한다.
   */
  async hasReadPermission() {
    throw new Error(
      'hasReadPermission() must be implemented by Android adapter'
    );
  }

  /**
   * 실제 구현체가 override 해야 한다.
   *
   * 반환:
   * ContactRecord[]
   */
  async readContacts() {
    throw new Error('readContacts() must be implemented by Android adapter');
  }

  /**
   * 공통 안전 wrapper.
   */
  async executeRead() {
    const permitted = await this.hasReadPermission();

    if (permitted !== true) {
      return {
        ok: false,
        permission_required: ANDROID_CONTACT_PERMISSION.READ,
        contacts: [],
        mutation_performed: false,
        authority_granted: false,
      };
    }

    const contacts = await this.readContacts();

    if (!Array.isArray(contacts)) {
      throw new Error('readContacts() must return an array');
    }

    return {
      ok: true,
      contacts: contacts.map(sanitizeAndroidContact),
      mutation_performed: false,
      authority_granted: false,
    };
  }

  mergeContacts() {
    throw new Error(
      'CONTACT_MERGE is not available in Android CONTACT v0.1'
    );
  }

  deleteContact() {
    throw new Error(
      'CONTACT_DELETE is not available in Android CONTACT v0.1'
    );
  }

  writeContact() {
    throw new Error(
      'CONTACT_WRITE is not available in Android CONTACT v0.1'
    );
  }
}

module.exports = {
  AndroidContactAdapterContract,
  ANDROID_CONTACT_PERMISSION,
  CONTACT_ADAPTER_CAPABILITY,
  validateContactRecord,
  sanitizeAndroidContact,
};
