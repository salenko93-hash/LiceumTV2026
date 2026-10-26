"""Pi 4 boot display configuration must preserve bootability on repeat installs."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('display', Path(__file__).resolve().parents[1] / 'scripts/configure-rpi4-display.py')
display = importlib.util.module_from_spec(spec)
spec.loader.exec_module(display)


class DisplayTests(unittest.TestCase):
    def test_preserves_boot_arguments_and_secondary_display_and_original_backup(self):
        original = 'console=serial0,115200 root=PARTUUID=abc rootwait video=HDMI-A-1:3840x2160@60 video=HDMI-A-2:1280x720@60\n'
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'cmdline.txt'
            p.write_text(original)
            self.assertTrue(display.configure(p))
            self.assertEqual(p.read_text().split(), ['console=serial0,115200', 'root=PARTUUID=abc', 'rootwait', 'video=HDMI-A-2:1280x720@60', display.MODE])
            self.assertFalse(display.configure(p))
            self.assertEqual(p.with_name('cmdline.txt.lyceumtv-rpi4.bak').read_text(), original)

    def test_refuses_malformed_boot_file_without_changes(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'cmdline.txt'
            p.write_text('root=abc\nrootwait\n')
            with self.assertRaises(ValueError):
                display.configure(p)
            self.assertEqual(p.read_text(), 'root=abc\nrootwait\n')
            self.assertFalse(p.with_name('cmdline.txt.lyceumtv-rpi4.bak').exists())


if __name__ == '__main__':
    unittest.main()
