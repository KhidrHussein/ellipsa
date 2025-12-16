
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  using System.Text;
  public class WindowHelper {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    
    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    public static string GetActiveWindowTitle() {
      IntPtr handle = GetForegroundWindow();
      StringBuilder title = new StringBuilder(256);
      GetWindowText(handle, title, 256);
      return title.ToString();
    }
    
    public static uint GetActiveWindowPid() {
      IntPtr handle = GetForegroundWindow();
      uint pid;
      GetWindowThreadProcessId(handle, out pid);
      return pid;
    }
  }
"@

try {
  $title = [WindowHelper]::GetActiveWindowTitle()
  $targetPid = [WindowHelper]::GetActiveWindowPid()
  
  $process = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
  $appName = if ($process) { $process.ProcessName } else { "Unknown" }
  
  # Output JSON for easy parsing
  $output = @{
    title = $title
    appName = $appName
    pid = $targetPid
  }
  
  Write-Output ($output | ConvertTo-Json -Compress)
} catch {
  Write-Output "{""title"":"""",""appName"":""Unknown"",""error"":""$($_.Exception.Message)""}"
}
