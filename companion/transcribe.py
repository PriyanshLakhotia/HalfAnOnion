import json
import sys
from faster_whisper import WhisperModel

# Model is baked into the image. No model downloads or API keys at request time.
model = WhisperModel('/opt/whisper-base', device='cpu', compute_type='int8', cpu_threads=2)
segments, info = model.transcribe(sys.argv[1], beam_size=3, vad_filter=True,
    initial_prompt='Groceries and recipes. Paneer, dal, chawal, jeera, atta. Albert Heijn, ALDI, Jumbo, PLUS, Bahar Delft.')
if info.duration > 65:
    raise ValueError('Recording exceeds one minute')
text = ' '.join(segment.text.strip() for segment in segments).strip()
if not text:
    raise ValueError('No speech found')
print(json.dumps({'text': text}))
