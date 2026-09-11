package com.nurion.arkaon

import android.content.Intent
import android.os.Bundle
import android.speech.RecognizerIntent
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
import java.util.Locale

/**
 * Android Device Adapter v0.1
 * Voice/text input → CONTACT READ → analyze API → proposal display.
 * No WRITE / MERGE / DELETE.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private lateinit var permissions: PermissionController
    private lateinit var coordinator: PhoneFriendContactCoordinator

    private val contactsPermissionLauncher =
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

    private val micPermissionLauncher =
        registerForActivityResult(
            ActivityResultContracts.RequestPermission()
        ) { granted ->
            if (granted) {
                startVoiceInput()
            } else {
                binding.presenceLabel.text = "이건 조심해야 할 것 같아."
                binding.assistantText.text =
                    "마이크 권한이 필요해요. 설정에서 마이크를 허용해 주세요."
            }
        }

    private val voiceInputLauncher =
        registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            val matches =
                result.data
                    ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)

            val utterance = matches?.firstOrNull()?.trim().orEmpty()
            if (utterance.isNotEmpty()) {
                binding.utteranceInput.setText(utterance)
                submit(utterance)
            } else {
                binding.presenceLabel.text = "응, 듣고 있어."
                binding.assistantText.text =
                    "음성이 잘 안 들렸어요. 다시 마이크를 눌러 말해 주세요."
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        permissions = PermissionController(this)
        val reader = AndroidContactsReader(contentResolver)
        val bridge = ArkaonDeviceBridge(permissions, reader)
        val api = PhoneFriendApiClient(BuildConfig.PHONE_FRIEND_BASE_URL)

        coordinator = PhoneFriendContactCoordinator(
            deviceBridge = bridge,
            apiClient = api
        )

        binding.sendButton.setOnClickListener { submit() }
        binding.micButton.setOnClickListener { requestVoiceInput() }
        binding.utteranceInput.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                submit()
                true
            } else {
                false
            }
        }
    }

    private fun requestVoiceInput() {
        if (permissions.hasRecordAudio()) {
            startVoiceInput()
        } else {
            binding.presenceLabel.text = "잠깐만, 확인해볼게."
            binding.assistantText.text =
                "말로 하시려면 마이크 권한이 필요해요. 허용해 주시면 들을게요."
            micPermissionLauncher.launch(PermissionController.RECORD_AUDIO)
        }
    }

    private fun startVoiceInput() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(
                RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
            )
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.KOREAN)
            putExtra(RecognizerIntent.EXTRA_PROMPT, "아르카온에게 말해 보세요")
        }

        try {
            binding.presenceLabel.text = "응, 듣고 있어."
            voiceInputLauncher.launch(intent)
        } catch (_: Exception) {
            binding.assistantText.text =
                "이 기기에서는 음성 입력을 열지 못했어요. 텍스트로도 말씀해 주세요."
        }
    }

    private fun submit(forced: String? = null) {
        val utterance =
            (forced ?: binding.utteranceInput.text?.toString().orEmpty())
                .trim()

        if (utterance.isEmpty()) return

        binding.utteranceInput.setText("")
        binding.presenceLabel.text = "잠깐만, 확인해볼게."
        binding.sendButton.isEnabled = false
        binding.micButton.isEnabled = false

        lifecycleScope.launch {
            try {
                val state = coordinator.handleUtterance(utterance)
                render(state)

                if (state.needsPermissionRequest) {
                    contactsPermissionLauncher.launch(
                        PermissionController.READ_CONTACTS
                    )
                }
            } finally {
                binding.sendButton.isEnabled = true
                binding.micButton.isEnabled = true
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
