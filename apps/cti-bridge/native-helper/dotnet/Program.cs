using System;
using System.Collections.Generic;
using System.IO;
using System.Text.Json;
using System.Threading;

namespace EstateCtiHelper
{
    /// <summary>
    /// 32bit COM/ActiveX 브릿지 헬퍼 스켈레톤.
    ///
    /// cti-bridge(64bit Node)가 자식 프로세스로 스폰하고 stdin/stdout
    /// JSON-lines로 통신한다. 프로토콜: ../README.md
    ///
    /// 사용: EstateCtiHelper.exe --provider kt|multicid
    ///
    /// ⚠️ COM 통합부는 SDK(KTPCBizX 설치본 / multicid.ocx) 없이는 컴파일할 수
    /// 없으므로 TODO 블록으로 남겨져 있다. 레거시 원본 대응 지점은 각 TODO 참고.
    /// </summary>
    internal static class Program
    {
        private static readonly object StdoutLock = new object();

        private static int Main(string[] args)
        {
            string provider = ParseProvider(args);
            if (provider == null)
            {
                Console.Error.WriteLine("usage: EstateCtiHelper.exe --provider kt|multicid");
                return 2;
            }

            // COM/ActiveX 이벤트는 STA 스레드 + 메시지 루프가 필요하다.
            // (레거시는 WinForms UI 스레드가 이 역할을 했음 — ucWyz.WndProc 등)
            var stdinThread = new Thread(() => StdinLoop(provider)) { IsBackground = false };
            stdinThread.SetApartmentState(ApartmentState.STA);
            stdinThread.Start();
            stdinThread.Join();
            return 0;
        }

        private static string ParseProvider(string[] args)
        {
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == "--provider") return args[i + 1];
            }
            return null;
        }

        private static void StdinLoop(string provider)
        {
            Emit(new Dictionary<string, object>
            {
                ["type"] = "status",
                ["connected"] = false,
                ["message"] = provider + " helper started (COM integration TODO)",
            });

            string line;
            while ((line = Console.In.ReadLine()) != null)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;

                JsonDocument doc;
                try { doc = JsonDocument.Parse(line); }
                catch (JsonException) { continue; }

                using (doc)
                {
                    string type = doc.RootElement.TryGetProperty("type", out var t)
                        ? t.GetString()
                        : null;

                    switch (type)
                    {
                        case "start":
                            HandleStart(provider, doc.RootElement);
                            break;
                        case "dial":
                            HandleDial(provider, doc.RootElement);
                            break;
                        case "stop":
                            return;
                    }
                }
            }
        }

        private static void HandleStart(string provider, JsonElement msg)
        {
            if (provider == "kt")
            {
                // TODO(KT): KTPCBizX COM 로그인 — 레거시 frmMain.KTPLogin 이식.
                //   1. KTOpenApi COM 인스턴스 생성 (KTPCBizX)
                //   2. lines[0]의 loginId/password/authKey(sKTPAuthKey)로 로그인
                //   3. EventCID 구독:
                //      - sResult == "201" (착신) → Emit incoming
                //        channelKey = "41:" + caller + "|" + seqno   (레거시 sKTPreChannel)
                //      - sResult == "407" (종료) → Emit callEnded
                //   4. 로그인 성공 시 Emit status connected=true
                Emit(Status(false, "KT COM 통합 미구현 — TODO(KT) 참고"));
            }
            else if (provider == "multicid")
            {
                // TODO(MULTICID): multicid.ocx 이벤트 싱크 — 레거시 ucSunPo 이식.
                //   1. CLSID로 Multicid 인스턴스 생성 (STA 스레드에서)
                //   2. CidMsgRx 이벤트 → 숫자 외 문자 제거(len > 4만 유효) → Emit incoming
                //      channelKey = "20:" + cid + ":" + DateTime.Now.ToString("yyyyMMddHHmm")
                //   3. 장치 오픈 성공 시 Emit status connected=true
                Emit(Status(false, "멀티CID OCX 통합 미구현 — TODO(MULTICID) 참고"));
            }
        }

        private static void HandleDial(string provider, JsonElement msg)
        {
            string requestId = msg.TryGetProperty("requestId", out var r) ? r.GetString() : "";

            // TODO(KT): KTOpenApi.SendCTC(sendNo, phoneNumber) → 200이면 success
            // TODO(MULTICID): DialReady 대기 후 axMulticid.phoneCall(phoneNumber)
            Emit(new Dictionary<string, object>
            {
                ["type"] = "dialResult",
                ["requestId"] = requestId,
                ["success"] = false,
                ["message"] = provider + " 발신 미구현 (COM 통합 TODO)",
            });
        }

        private static Dictionary<string, object> Status(bool connected, string message)
        {
            return new Dictionary<string, object>
            {
                ["type"] = "status",
                ["connected"] = connected,
                ["message"] = message,
            };
        }

        /// <summary>stdout으로 JSON 1줄 방출 (스레드 안전 — COM 이벤트 스레드에서도 호출됨)</summary>
        private static void Emit(Dictionary<string, object> payload)
        {
            string json = JsonSerializer.Serialize(payload);
            lock (StdoutLock)
            {
                Console.Out.WriteLine(json);
                Console.Out.Flush();
            }
        }
    }
}
