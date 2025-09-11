import { test, expect } from '@playwright/test';

test.describe('FPL Optimizer Basic Functionality', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/');
    
    // Check if the main heading is visible
    await expect(page.getByRole('heading', { name: 'FPL Squad Optimizer' })).toBeVisible();
    
    // Check if the analyze button is present
    await expect(page.getByRole('button', { name: 'Analyze My Squad' })).toBeVisible();
  });

  test('should show squad builder form', async ({ page }) => {
    await page.goto('/');
    
    // Check if squad builder elements are present
    await expect(page.getByText('Squad Builder')).toBeVisible();
    await expect(page.getByText('Starting XI')).toBeVisible();
    await expect(page.getByText('Bench')).toBeVisible();
  });

  test('should show weights panel', async ({ page }) => {
    await page.goto('/');
    
    // Check if weights panel is present
    await expect(page.getByText('Analysis Weights')).toBeVisible();
    await expect(page.getByText('Form')).toBeVisible();
    await expect(page.getByText('xG/90')).toBeVisible();
  });

  test('should allow weight adjustment', async ({ page }) => {
    await page.goto('/');
    
    // Find the form weight slider
    const formSlider = page.locator('input[type="range"]').first();
    
    // Get initial value
    const initialValue = await formSlider.inputValue();
    
    // Adjust the slider
    await formSlider.fill('0.5');
    
    // Check if value changed
    const newValue = await formSlider.inputValue();
    expect(newValue).toBe('0.5');
  });

  test('should show quick start demo', async ({ page }) => {
    await page.goto('/');
    
    // Click the demo button
    await page.getByRole('button', { name: 'View Demo Analysis' }).click();
    
    // Should navigate to analyze page
    await expect(page).toHaveURL('/analyze');
    
    // Should show analysis results
    await expect(page.getByText('Squad Analysis Results')).toBeVisible();
  });

  test('should handle empty squad analysis', async ({ page }) => {
    await page.goto('/');
    
    // Try to analyze with empty squad
    await page.getByRole('button', { name: 'Analyze My Squad' }).click();
    
    // Should show error message
    await expect(page.getByText('Please complete your squad')).toBeVisible();
  });

  test('should show bank input', async ({ page }) => {
    await page.goto('/');
    
    // Check if bank input is present
    const bankInput = page.getByLabel('Bank (Remaining Budget)');
    await expect(bankInput).toBeVisible();
    
    // Test bank input
    await bankInput.fill('5.0');
    await expect(bankInput).toHaveValue('5.0');
  });
});

