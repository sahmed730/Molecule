import os
from dotenv import load_dotenv
load_dotenv()
from openai import OpenAI
client = OpenAI(base_url='https://integrate.api.nvidia.com/v1', api_key=os.environ.get('NVIDIA_API_KEY'))
completion = client.chat.completions.create(model='nvidia/nemotron-3-ultra-550b-a55b', messages=[{'role':'user','content':'test'}], temperature=1, top_p=0.95, max_tokens=16384, extra_body={'chat_template_kwargs':{'enable_thinking':True},'reasoning_budget':16384}, stream=False)
print(completion.choices[0].message.content)
