import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options

chrome_options = Options()
chrome_options.binary_location = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
chrome_options.add_argument('--headless=new')
chrome_options.add_argument('--window-size=1600,1000')

driver = webdriver.Chrome(options=chrome_options)
try:
    driver.get('http://127.0.0.1:8000')
    time.sleep(1)

    user_input = driver.find_element(By.ID, 'unified-login-id')
    pass_input = driver.find_element(By.ID, 'unified-login-password')
    btn = driver.find_element(By.ID, 'unified-login-btn')

    user_input.send_keys('admin@corpsec.co.ke')
    pass_input.send_keys('Admin@CorpSec2026!')
    btn.click()

    time.sleep(2)
    print('Current URL:', driver.current_url)
    dash_vis = driver.execute_script('return document.getElementById("tab-dashboard") ? document.getElementById("tab-dashboard").offsetHeight > 0 : false')
    print('Dashboard element rendered:', dash_vis)
finally:
    driver.quit()
