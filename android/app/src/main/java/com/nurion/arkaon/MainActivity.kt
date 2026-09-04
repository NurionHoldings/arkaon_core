package com.nurion.arkaon

import android.os.Bundle
import android.view.inputmethod.EditorInfo
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.nurion.arkaon.bridge.ArkaonDeviceBridge
import com.nurion.arkaon.contacts.AndroidContactsReader
import com.nurion.arkaon.databinding.ActivityMainBinding
import com.nurion.arkaon.permissions.PermissionController
import com.nurion.arkaon.phonefriend.PhoneFriendApiClient
import com.nurion.arkaon.phonefriend.PhoneFriendContactCoordinator
import kotlinx.coroutines.launch

/**
 * Android Device Adapter v0.1
 * CONTACT READ → analyze API → proposal display.
 * No WRITE / MERGE / DELETE.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var coordinator: PhoneFriendContactCoordinator

    private val permissionLauncher =
        registerForActivityResult(
            ActivityResultContracts.RequestPermission()
        ) { granted ->
            lifecycleScope.launch {
                val state = if (granted) {
                    coordinator.continueAfterPermissionGranted()
                } else {
                    coordinator.onPermissionDenied()
                }
                render(state)
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val permissions = PermissionController(this)
        val reader = AndroidContactsReader(contentResolver)
        val bridge = ArkaonDeviceBridge(permissions, reader)
        val api = PhoneFriendApiClient(BuildConfig.PHONE_FRIEND_BASE_URL)

        coordinator = PhoneFriendContactCoordinator(
            deviceBridge = bridge,
            apiClient = api
        )

        binding.sendButton.setOnClickListener { submit() }
        binding.utteranceInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                submit()
                true
            } else {
                false
            }
        }
    }

    private fun submit() {
        val utterance =
            binding.utteranceInput.text
                ?.toString()
                .orEmpty()
                .trim()

        if (utterance.isEmpty()) return

        binding.utteranceInput.setText("")
        binding.presenceLabel.text = "잠깐만, 확인해볼게."
        binding.sendButton.isEnabled = false

        lifecycleScope.launch {
            try {
                val state = coordinator.handleUtterance(utterance)
                render(state)

                if (state.needsPermissionRequest) {
                    permissionLauncher.launch(
                        PermissionController.READ_CONTACTS
                    )
                }
            } finally {
                binding.sendButton.isEnabled = true
            }
        }
    }

    private fun render(state: PhoneFriendContactCoordinator.UiState) {
        binding.presenceLabel.text = state.presence
        binding.assistantText.text = state.assistantText
        binding.progressText.text = state.progressText
        binding.proposalsText.text = state.proposalsText
    }
}
